-- Endurecimento de acessos — achados da revisão de segurança de 15/10/2026.
--
-- Cada item abaixo foi CONFIRMADO no banco de produção (leitura) antes de ser
-- corrigido; o que foi medido está no comentário. NÃO foi executada contra a base
-- real; ensaiada num Postgres 16 descartável, com o papel `authenticated` de
-- verdade (SET ROLE), e não só lendo a definição.

-- ---------------------------------------------------------------------------
-- 0. "Administrador da empresa"
-- ---------------------------------------------------------------------------
-- `check_membership` devolve true para QUALQUER linha em `memberships` — papel
-- `viewer` incluído (medido: a função não menciona `role`). As políticas abaixo
-- precisam distinguir quem administra de quem só lê.
CREATE OR REPLACE FUNCTION public.eh_admin_da_empresa(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
     WHERE m.user_id = auth.uid()
       AND m.company_id = p_company_id
       AND m.role IN ('owner', 'admin')
  );
$$;
REVOKE ALL ON FUNCTION public.eh_admin_da_empresa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eh_admin_da_empresa(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Conexão da Evolution e configurações de mensagem — SOMENTE leitura
-- ---------------------------------------------------------------------------
-- Medido: `authenticated` tinha INSERT/UPDATE/DELETE em `whatsapp_instances` e
-- `whatsapp_automation_settings`, sob policy `FOR ALL` que só conferia ser
-- membro. Um `viewer` podia trocar `instance_name` para o de OUTRA empresa
-- (`altflow_` + 20 hex do company_id — determinístico) e, pela função de
-- desconectar, apagar a sessão pareada dela na Evolution (chave global).
-- Nenhum código do navegador escreve nessas tabelas (verificado): quem escreve é
-- o servidor, com a chave de serviço.
DROP POLICY IF EXISTS "Membros gerenciam a conexao da empresa" ON public.whatsapp_instances;
DROP POLICY IF EXISTS whatsapp_instances_leitura ON public.whatsapp_instances;
CREATE POLICY whatsapp_instances_leitura ON public.whatsapp_instances
  FOR SELECT TO authenticated USING (public.check_membership(company_id));
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_instances FROM authenticated, anon;

DROP POLICY IF EXISTS "Membros gerenciam as configuracoes da empresa" ON public.whatsapp_automation_settings;
DROP POLICY IF EXISTS whatsapp_automation_settings_leitura ON public.whatsapp_automation_settings;
CREATE POLICY whatsapp_automation_settings_leitura ON public.whatsapp_automation_settings
  FOR SELECT TO authenticated USING (public.check_membership(company_id));
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_automation_settings FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. Regras e ações de automação — escrita só de dono/administrador
-- ---------------------------------------------------------------------------
-- Medido: policy `FOR ALL` por `check_membership` e DELETE/INSERT/UPDATE para
-- `authenticated`. Um `viewer` criava regra `enviar_template` com `para` = número
-- de terceiro (a empresa envia pelo número dela) ou `webhook` para uma URL sua,
-- exfiltrando o payload de todos os leads futuros.
--
-- EFEITO NO PRODUTO: membro comum deixa de EDITAR automações pela tela (ele
-- continua vendo). É mudança de comportamento, e é a certa: editar regra é
-- decidir o que o sistema envia em nome da empresa.
DROP POLICY IF EXISTS "Regras da empresa" ON public.automation_rules;
DROP POLICY IF EXISTS automation_rules_leitura ON public.automation_rules;
DROP POLICY IF EXISTS automation_rules_escrita ON public.automation_rules;
CREATE POLICY automation_rules_leitura ON public.automation_rules
  FOR SELECT TO authenticated USING (public.check_membership(company_id));
CREATE POLICY automation_rules_escrita ON public.automation_rules
  FOR ALL TO authenticated
  USING (public.eh_admin_da_empresa(company_id))
  WITH CHECK (public.eh_admin_da_empresa(company_id));

DROP POLICY IF EXISTS "Ações da empresa" ON public.automation_actions;
DROP POLICY IF EXISTS automation_actions_leitura ON public.automation_actions;
DROP POLICY IF EXISTS automation_actions_escrita ON public.automation_actions;
CREATE POLICY automation_actions_leitura ON public.automation_actions
  FOR SELECT TO authenticated USING (public.check_membership(company_id));
-- A regra apontada tem de ser DA MESMA empresa: sem isto, um membro da empresa A
-- anexava uma ação à regra da empresa B (o job é de B, e a ação rodava com o
-- número de B).
CREATE POLICY automation_actions_escrita ON public.automation_actions
  FOR ALL TO authenticated
  USING (public.eh_admin_da_empresa(company_id))
  WITH CHECK (
    public.eh_admin_da_empresa(company_id)
    AND EXISTS (
      SELECT 1 FROM public.automation_rules r
       WHERE r.id = automation_actions.rule_id AND r.company_id = automation_actions.company_id
    )
  );

-- A fila é do servidor.
REVOKE INSERT, UPDATE, DELETE ON public.automation_jobs FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Marcar rascunhos abandonados — só o agendador
-- ---------------------------------------------------------------------------
-- Medido: SECURITY DEFINER, sem filtro de empresa, EXECUTE para `authenticated`.
-- Qualquer usuário de qualquer empresa podia chamar com `p_minutos = 1` e marcar
-- como abandonado o rascunho de TODAS as empresas, antecipando as automações.
REVOKE EXECUTE ON FUNCTION public.marcar_rascunhos_abandonados(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_rascunhos_abandonados(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Fila de automação: reserva ATÔMICA e recuperação
-- ---------------------------------------------------------------------------
-- O despachante lia os pendentes e só depois marcava `running`, sem conferir que
-- ainda estavam pendentes: duas execuções simultâneas (sobreposição do cron ou
-- chamada manual) pegavam os mesmos jobs e o lead recebia a mensagem em dobro.
-- E um job que caía no meio ficava `running` para sempre.
CREATE OR REPLACE FUNCTION public.reservar_jobs_de_automacao(p_limite integer DEFAULT 25)
RETURNS SETOF public.automation_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.automation_jobs j
     SET status = 'running',
         attempts = j.attempts + 1,
         started_at = now()
   WHERE j.id IN (
     SELECT id FROM public.automation_jobs
      WHERE status = 'pending' AND attempts < 4
      ORDER BY created_at
      LIMIT greatest(1, least(p_limite, 100))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING j.*;
$$;

CREATE OR REPLACE FUNCTION public.liberar_jobs_de_automacao_presos(p_minutos integer DEFAULT 10)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH liberados AS (
    UPDATE public.automation_jobs
       SET status = CASE WHEN attempts >= 4 THEN 'failed' ELSE 'pending' END,
           last_error = coalesce(last_error, 'interrompido durante a execução'),
           finished_at = CASE WHEN attempts >= 4 THEN now() ELSE finished_at END
     WHERE status = 'running'
       AND started_at < now() - make_interval(mins => greatest(p_minutos, 2))
    RETURNING 1
  )
  SELECT count(*)::integer FROM liberados;
$$;

REVOKE ALL ON FUNCTION public.reservar_jobs_de_automacao(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liberar_jobs_de_automacao_presos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_jobs_de_automacao(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.liberar_jobs_de_automacao_presos(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Fila de conversão: reserva por arrendamento (lease)
-- ---------------------------------------------------------------------------
-- `conversion_dispatches.status` só admite pending/sent/failed/skipped, então
-- não há "running": a reserva é um prazo. Um envio de conversão duplicado ensina
-- errado ao Google/Meta (a mesma venda contada duas vezes).
ALTER TABLE public.conversion_dispatches
  ADD COLUMN IF NOT EXISTS reservado_ate timestamptz;

CREATE OR REPLACE FUNCTION public.reservar_conversoes(p_limite integer DEFAULT 25)
RETURNS SETOF public.conversion_dispatches
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.conversion_dispatches d
     SET reservado_ate = now() + interval '5 minutes'
   WHERE d.id IN (
     SELECT id FROM public.conversion_dispatches
      WHERE status = 'pending' AND attempts < 5
        AND (reservado_ate IS NULL OR reservado_ate < now())
      ORDER BY created_at
      LIMIT greatest(1, least(p_limite, 100))
      FOR UPDATE SKIP LOCKED
   )
  RETURNING d.*;
$$;
REVOKE ALL ON FUNCTION public.reservar_conversoes(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_conversoes(integer) TO service_role;
