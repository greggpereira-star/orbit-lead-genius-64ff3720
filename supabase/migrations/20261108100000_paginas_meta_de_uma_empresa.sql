-- Uma página do Facebook pertence a UMA empresa; e o token dela não sai do servidor.
--
-- MEDIDO em 28/10/2026 (consulta somente-leitura em produção):
--   * a página "Sossae Empreendimentos" (821676401282292) estava gravada em DUAS empresas: na
--     própria e na da Taciane. O login da Meta devolve todas as páginas que quem conecta já liberou
--     ao app, e a conexão gravava todas — a escolha feita no Facebook não restringia nada;
--   * não havia unicidade em `page_id`. O webhook de lead chega só com o `page_id`, e a busca da
--     empresa usa `.maybeSingle()`: com a página em duas empresas, a consulta erra e o lead da
--     Sossae viraria "Page not connected" (descartado);
--   * `authenticated` lê `page_access_token` (token com leads_retrieval) pelo cliente do banco —
--     o mesmo furo que 20261015170000 fechou em `meta_lead_connections`.

-- 1. Páginas repetidas: fica a mais antiga (a de quem conectou primeiro). Os formulários da página
--    que sai ficam, inativos, para não apagar mapeamento nem histórico.
WITH ranqueadas AS (
  SELECT id, row_number() OVER (PARTITION BY page_id ORDER BY created_at, id) AS posicao
    FROM public.meta_lead_pages
),
removidas AS (
  DELETE FROM public.meta_lead_pages p
   USING ranqueadas r
   WHERE p.id = r.id AND r.posicao > 1
  RETURNING p.company_id, p.page_id
)
UPDATE public.meta_lead_forms f
   SET is_active = false
  FROM removidas r
 WHERE f.company_id = r.company_id AND f.page_id = r.page_id;

-- 2. Uma página, uma empresa. Substitui o índice comum de `page_id`.
CREATE UNIQUE INDEX IF NOT EXISTS meta_lead_pages_page_id_unico ON public.meta_lead_pages (page_id);
DROP INDEX IF EXISTS public.idx_meta_lead_pages_page_id;

-- 3. O token da página só o servidor lê. Todo uso em `src/` passa por `supabaseAdmin`.
REVOKE SELECT ON public.meta_lead_pages FROM authenticated;
GRANT SELECT (
  id, company_id, connection_id, page_id, page_name, category,
  subscribed, subscribed_at, created_at, updated_at
) ON public.meta_lead_pages TO authenticated;

NOTIFY pgrst, 'reload schema';
