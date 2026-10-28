-- Camada de planos: quem tem direito a quê.
--
-- Princípios:
--  • Plano é DADO (linhas em `plans`), não código. Renomear, reordenar ou mudar o
--    que cada plano inclui é um UPDATE, sem deploy.
--  • A trava vale só para as chaves de recurso consultadas. Funcionalidade que já
--    existe não passa por aqui, então criar esta camada não tira nada de ninguém.
--  • Chave desconhecida nega. Esquecer de cadastrar um recurso deixa-o fechado, o
--    erro seguro para algo que se vende por plano.
--  • Sem linha em `company_plans`, vale o plano-base (`essencial`). Empresa nova
--    nasce sem recursos pagos até alguém atribuir um plano.
--  • Quem muda o plano é o servidor (chave de serviço): não há cobrança integrada
--    nem administrador da plataforma, e o navegador nunca pode se promover.

CREATE TABLE IF NOT EXISTS public.plans (
  codigo     text PRIMARY KEY CHECK (codigo ~ '^[a-z][a-z0-9_]{1,30}$'),
  nome       text NOT NULL,
  ordem      integer NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  -- {chave: true | false | número}. Número é limite (ex.: ia_limite_mensal).
  recursos   jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(recursos) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_plans (
  company_id   uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  plano        text NOT NULL REFERENCES public.plans(codigo),
  status       text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'teste', 'suspenso')),
  teste_ate    timestamptz,
  -- Acordos fora da tabela de preços: sobrepõem o plano, recurso a recurso.
  excecoes     jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(excecoes) = 'object'),
  observacao   text,
  alterado_por uuid,
  alterado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teste_exige_data CHECK (status <> 'teste' OR teste_ate IS NOT NULL)
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_leitura ON public.plans;
CREATE POLICY plans_leitura ON public.plans FOR SELECT TO authenticated USING (ativo);

DROP POLICY IF EXISTS company_plans_leitura ON public.company_plans;
CREATE POLICY company_plans_leitura ON public.company_plans
  FOR SELECT TO authenticated USING (public.check_membership(company_id));

REVOKE ALL ON public.plans, public.company_plans FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.plans, public.company_plans FROM authenticated;
GRANT SELECT ON public.plans, public.company_plans TO authenticated;
GRANT ALL ON public.plans, public.company_plans TO service_role;

-- Plano de partida (propostas editáveis; preço não mora aqui).
INSERT INTO public.plans (codigo, nome, ordem, recursos) VALUES
  ('essencial',    'Essencial',    1, '{"api_publica": false, "webhooks_assinados": false, "ia_classificacao": false, "ia_limite_mensal": 0}'),
  ('profissional', 'Profissional', 2, '{"api_publica": false, "webhooks_assinados": false, "ia_classificacao": true,  "ia_limite_mensal": 500}'),
  ('escala',       'Escala',       3, '{"api_publica": true,  "webhooks_assinados": true,  "ia_classificacao": true,  "ia_limite_mensal": 5000}')
ON CONFLICT (codigo) DO NOTHING;

-- Quem já usa o sistema antes dos planos existirem fica no mais alto: introduzir
-- a camada não pode tirar nada de quem já estava aqui.
INSERT INTO public.company_plans (company_id, plano, observacao)
SELECT c.id, 'escala', 'Anterior à criação dos planos'
FROM public.companies c
ON CONFLICT (company_id) DO NOTHING;

-- Valor efetivo de um recurso: exceção da empresa > plano > nada.
-- Plano suspenso ou teste vencido volta ao plano-base, sem apagar o cadastro.
CREATE OR REPLACE FUNCTION public.valor_do_recurso(p_company_id uuid, p_chave text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cp public.company_plans%ROWTYPE;
  v_plano text;
  rec jsonb;
BEGIN
  PERFORM public.exigir_acesso_a_empresa(p_company_id);

  SELECT * INTO cp FROM public.company_plans WHERE company_id = p_company_id;
  IF NOT FOUND
     OR cp.status = 'suspenso'
     OR (cp.status = 'teste' AND cp.teste_ate < now()) THEN
    v_plano := 'essencial';
    rec := '{}'::jsonb;
  ELSE
    v_plano := cp.plano;
    rec := cp.excecoes;
  END IF;

  IF rec ? p_chave THEN
    RETURN rec -> p_chave;
  END IF;
  RETURN (SELECT p.recursos -> p_chave FROM public.plans p WHERE p.codigo = v_plano);
END;
$$;

-- Verdadeiro se o recurso é `true` ou um limite maior que zero. Ausente = falso.
CREATE OR REPLACE FUNCTION public.tem_recurso(p_company_id uuid, p_chave text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE jsonb_typeof(v)
           WHEN 'boolean' THEN v = 'true'::jsonb
           WHEN 'number'  THEN (v #>> '{}')::numeric > 0
           ELSE false
         END
  FROM (SELECT public.valor_do_recurso(p_company_id, p_chave) AS v) t;
$$;

-- O que a tela de plano mostra: plano efetivo e recursos já mesclados.
CREATE OR REPLACE FUNCTION public.plano_da_empresa(p_company_id uuid)
RETURNS TABLE (plano text, nome text, status text, teste_ate timestamptz, recursos jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cp public.company_plans%ROWTYPE;
  v_efetivo text;
  v_vale boolean;
  v_achou boolean;
BEGIN
  PERFORM public.exigir_acesso_a_empresa(p_company_id);
  SELECT * INTO cp FROM public.company_plans WHERE company_id = p_company_id;

  v_achou := FOUND;
  v_vale := v_achou AND cp.status <> 'suspenso' AND NOT (cp.status = 'teste' AND cp.teste_ate < now());
  v_efetivo := CASE WHEN v_vale THEN cp.plano ELSE 'essencial' END;

  RETURN QUERY
  SELECT p.codigo, p.nome,
         CASE WHEN NOT v_achou THEN 'ativo' WHEN v_vale THEN cp.status ELSE 'suspenso' END,
         CASE WHEN v_vale THEN cp.teste_ate END,
         p.recursos || CASE WHEN v_vale THEN cp.excecoes ELSE '{}'::jsonb END
  FROM public.plans p WHERE p.codigo = v_efetivo;
END;
$$;

-- Atribuir plano: só o servidor. Registra quem e por quê.
CREATE OR REPLACE FUNCTION public.definir_plano_da_empresa(
  p_company_id uuid,
  p_plano text,
  p_status text DEFAULT 'ativo',
  p_teste_ate timestamptz DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.chamada_de_servidor() THEN
    RAISE EXCEPTION 'apenas o servidor atribui plano' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.plans WHERE codigo = p_plano) THEN
    RAISE EXCEPTION 'plano inexistente: %', p_plano USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.company_plans (company_id, plano, status, teste_ate, observacao, alterado_em)
  VALUES (p_company_id, p_plano, p_status, p_teste_ate, p_observacao, now())
  ON CONFLICT (company_id) DO UPDATE
    SET plano = EXCLUDED.plano, status = EXCLUDED.status, teste_ate = EXCLUDED.teste_ate,
        observacao = EXCLUDED.observacao, alterado_em = now();

  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, changes)
  VALUES (p_company_id, NULL, 'plano_definido', 'company_plans',
          jsonb_build_object('plano', p_plano, 'status', p_status, 'teste_ate', p_teste_ate, 'observacao', p_observacao));
END;
$$;

REVOKE ALL ON FUNCTION public.valor_do_recurso(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tem_recurso(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.plano_da_empresa(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.definir_plano_da_empresa(uuid, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.valor_do_recurso(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tem_recurso(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.plano_da_empresa(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.definir_plano_da_empresa(uuid, text, text, timestamptz, text) TO service_role;
