-- Permite que quiz e formulário públicos descubram a etapa de entrada.
--
-- O visitante de um quiz ou formulário público é anônimo, e o papel `anon` não
-- tem SELECT em `stages` ("permission denied for table stages"). Resolver a
-- etapa lendo a tabela do cliente só funcionava para quem já estava logado —
-- ou seja, para mim testando, e não para o lead de verdade.
--
-- Dar `GRANT SELECT ON stages TO anon` resolveria, mas deixaria qualquer um
-- listar o funil de todas as empresas. Esta função devolve UM id e nada mais:
-- não dá para enumerar nome de etapa, nem descobrir funil de terceiros.
--
-- Regra igual à do cliente (resolveEntryStage em stageService.ts): a etapa
-- preferida vale se pertencer à empresa; senão a marcada como entrada; senão a
-- primeira do funil.
CREATE OR REPLACE FUNCTION public.resolve_entry_stage(
  p_company_id uuid,
  p_preferred uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT id FROM public.stages
      WHERE company_id = p_company_id AND id = p_preferred),
    (SELECT id FROM public.stages
      WHERE company_id = p_company_id AND is_entry
      LIMIT 1),
    (SELECT id FROM public.stages
      WHERE company_id = p_company_id
      ORDER BY order_index, created_at
      LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION public.resolve_entry_stage(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_entry_stage(uuid, uuid) TO anon, authenticated;
