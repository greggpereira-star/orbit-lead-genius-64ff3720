-- audit_logs: trilha que só se acrescenta.
--
-- Medido em produção: uma política `FOR ALL` por `check_membership` deixava
-- QUALQUER membro (visualizador incluído) ler, alterar e APAGAR a trilha de
-- auditoria da empresa — o contrário do que uma trilha é. A tabela está vazia e
-- nenhuma tela a lê; o único escritor no código (`auditService.logAction`) grava
-- como a própria pessoa.
--
-- Agora, para o navegador:
--   ler        só dono/administrador;
--   acrescentar dono, administrador e atendente, e só em nome de si mesmos
--               (`user_id = auth.uid()`: ninguém registra ato em nome de outro);
--   alterar/apagar  ninguém. UPDATE e DELETE saem dos grants.
-- A chave de serviço (servidor) continua podendo tudo, para retenção/limpeza.

DROP POLICY IF EXISTS "Audit logs access" ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_leitura ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_acrescentar ON public.audit_logs;

CREATE POLICY audit_logs_leitura ON public.audit_logs
  FOR SELECT TO authenticated USING (public.eh_admin_da_empresa(company_id));

CREATE POLICY audit_logs_acrescentar ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.pode_escrever_na_empresa(company_id) AND user_id = auth.uid());

REVOKE ALL ON public.audit_logs FROM authenticated, anon;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
