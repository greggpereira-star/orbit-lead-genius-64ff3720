-- O token da Meta deixa de ser legível por membros da empresa.
--
-- MEDIDO em 15/10/2026 (consulta somente-leitura em produção):
--   * `authenticated` tem SELECT na tabela `meta_lead_connections` inteira;
--   * a policy `meta_conn_read_own_company` libera a linha para qualquer
--     membro (`check_membership(company_id)`);
--   * a tabela tem a coluna `access_token`.
-- Ou seja: qualquer membro, pelo cliente Supabase do navegador, podia ler o
-- token de acesso da empresa à Meta. Todo uso no servidor passa pela chave de
-- serviço (`supabaseAdmin`), então o cliente não precisa dessa coluna.
--
-- Por que agora: o mesmo desenho seria copiado para o token do WhatsApp (de
-- longa duração) na Cloud API. Corrige-se antes de repetir.
--
-- Efeito: `select *` e `select access_token` do navegador passam a falhar com
-- "permission denied" — de propósito. As demais colunas continuam legíveis.
-- Nenhum código do app lê a coluna pelo cliente (verificado: todos os acessos a
-- `meta_lead_connections` em `src/` usam `supabaseAdmin`).

REVOKE SELECT ON public.meta_lead_connections FROM authenticated;

GRANT SELECT (
  id, company_id, meta_user_id, meta_user_name, token_expires_at,
  granted_scopes, status, connected_by, created_at, updated_at
) ON public.meta_lead_connections TO authenticated;

-- Conferência pós-aplicação (deve devolver 0 linhas):
--   SELECT 1 FROM information_schema.column_privileges
--    WHERE table_name = 'meta_lead_connections'
--      AND column_name = 'access_token' AND grantee = 'authenticated';
