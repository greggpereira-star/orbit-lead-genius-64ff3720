-- Etapa de qualificação explícita.
--
-- Até aqui "qualificado" era deduzido: a primeira etapa com mapeamento de
-- conversão ativo. Isso mistura duas coisas — "esta etapa envia evento às
-- plataformas" e "daqui em diante o lead é qualificado" — e quebra quando a
-- primeira etapa do funil também tem mapeamento (mesmo vazio): todo lead passa a
-- contar como qualificado e a taxa fica em 100% para sempre.
--
-- Agora a empresa marca UMA etapa como corte. Sem marca, vale a regra antiga,
-- para nenhuma empresa existente mudar de número sem querer.

ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS is_qualified_cut boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS stages_um_corte_por_empresa
  ON public.stages (company_id) WHERE is_qualified_cut;

-- Troca o corte numa transação só (o índice único parcial proíbe dois ao mesmo
-- tempo). `p_stage_id` nulo remove a marca e volta à regra antiga.
CREATE OR REPLACE FUNCTION public.definir_etapa_de_qualificacao(p_company_id uuid, p_stage_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.chamada_de_servidor() AND NOT public.eh_admin_da_empresa(p_company_id) THEN
    RAISE EXCEPTION 'apenas dono ou administrador' USING ERRCODE = '42501';
  END IF;
  IF p_stage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.stages WHERE id = p_stage_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'etapa não pertence à empresa' USING ERRCODE = '22023';
  END IF;

  UPDATE public.stages SET is_qualified_cut = false
   WHERE company_id = p_company_id AND is_qualified_cut;
  IF p_stage_id IS NOT NULL THEN
    UPDATE public.stages SET is_qualified_cut = true WHERE id = p_stage_id;
  END IF;

  INSERT INTO public.audit_logs (company_id, user_id, action, entity_type, entity_id, changes)
  VALUES (p_company_id, auth.uid(), 'etapa_de_qualificacao_definida', 'stages', p_stage_id,
          jsonb_build_object('stage_id', p_stage_id));
END;
$$;

REVOKE ALL ON FUNCTION public.definir_etapa_de_qualificacao(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_etapa_de_qualificacao(uuid, uuid) TO authenticated, service_role;

-- A régua passa a preferir a marca. Patch sobre a definição real das duas
-- funções que a usam, com asserção: se o trecho não estiver lá, aborta.
DO $$
DECLARE
  nome text;
  def text;
  ancora constant text := 'SELECT min(s.order_index) AS corte';
  novo constant text :=
    'SELECT coalesce((SELECT q.order_index FROM stages q WHERE q.company_id = p_company_id AND q.is_qualified_cut), min(s.order_index)) AS corte';
BEGIN
  FOREACH nome IN ARRAY ARRAY['relatorio_anuncios', 'resumo_analytics'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = nome;
    IF def IS NULL OR position(ancora in def) = 0 THEN
      RAISE EXCEPTION '%: trecho da régua não encontrado, nada foi alterado', nome;
    END IF;
    IF position('is_qualified_cut' in def) = 0 THEN
      EXECUTE replace(def, ancora, novo);
    END IF;
  END LOOP;
END $$;
