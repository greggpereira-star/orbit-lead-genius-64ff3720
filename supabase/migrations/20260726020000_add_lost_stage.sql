-- Cria a etapa "Perdido" nos funis que não têm uma.
--
-- Sem ela, o lead que diz não fica preso numa coluna para sempre: suja o
-- board, infla a contagem de "em andamento" e some do radar sem nunca ter
-- sido encerrado. Marcar como perdido é o que fecha o ciclo — e é o outro
-- lado de "Venda fechada" na hora de calcular taxa de conversão.
--
-- `kind = 'lost'` é o que importa: o nome é livre (o cliente pode trocar para
-- "Descartado" ou "Sem interesse"), mas o tipo é o que as métricas vão ler.
--
-- Idempotente: só cria onde ainda não existe etapa do tipo perdido, e só em
-- empresa que já tem funil montado.
INSERT INTO public.stages (company_id, name, color, order_index, kind, is_entry)
SELECT
  c.id,
  'Perdido',
  -- Vermelho da paleta de etapas (STAGE_COLORS em stageService.ts).
  '#ef4444',
  COALESCE(MAX(s.order_index), -1) + 1,
  'lost',
  false
FROM public.companies c
JOIN public.stages s ON s.company_id = c.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.stages x
   WHERE x.company_id = c.id AND x.kind = 'lost'
)
GROUP BY c.id;
