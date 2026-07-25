-- Unifica as duas noções de etapa que o app mantinha em paralelo.
--
-- `leads.status` (texto livre: new/contacted/…) alimentava a tabela de Leads e
-- o seletor do modal. `leads.stage_id` (FK → stages) alimentava o Kanban. Como
-- nenhum caminho de criação de lead gravava `stage_id`, ele estava NULL nos 106
-- leads e o pipeline renderizava seis colunas vazias desde sempre.
--
-- Daqui pra frente `stage_id` é a verdade. `status` continua existindo e sendo
-- escrito junto (o automationService e o sync CV.CRM podem lê-lo), mas passa a
-- ser derivado da etapa, não fonte independente.
--
-- Idempotente: só cria coluna que falta e só preenche lead com stage_id NULL.

-- ---------------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------------

-- Ganho/perdido precisa ser um atributo, não uma adivinhação pelo nome da
-- coluna: o cliente pode chamar a etapa final de "Venda", "Fechado" ou
-- "Escritura", e o funil de conversão precisa saber qual delas conta.
ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stages_kind_check'
  ) THEN
    ALTER TABLE public.stages
      ADD CONSTRAINT stages_kind_check CHECK (kind IN ('open', 'won', 'lost'));
  END IF;
END $$;

-- Onde o lead entra quando a integração não escolheu etapa.
ALTER TABLE public.stages
  ADD COLUMN IF NOT EXISTS is_entry boolean NOT NULL DEFAULT false;

-- Uma etapa de entrada por empresa. Índice parcial: só restringe as marcadas.
CREATE UNIQUE INDEX IF NOT EXISTS stages_one_entry_per_company
  ON public.stages (company_id) WHERE is_entry;

-- "Parado há 6 dias em Proposta" é o sinal que faz o corretor agir. Sem esta
-- coluna o card só sabe quando o lead ENTROU no sistema, não quando parou aqui.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz;

-- Ordem do card dentro da coluna. `double precision` para inserir entre dois
-- vizinhos com a média dos dois, sem reescrever a coluna inteira a cada
-- arrastar.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS board_order double precision;

-- O Kanban lê leads por etapa o tempo todo.
CREATE INDEX IF NOT EXISTS leads_stage_board_idx
  ON public.leads (company_id, stage_id, board_order);

-- ---------------------------------------------------------------------------
-- 2. Classificar as etapas existentes
-- ---------------------------------------------------------------------------

-- Pelo nome, que é o único sinal disponível nas etapas já criadas. Quem não
-- for reconhecido fica 'open', que é o padrão seguro — errar para 'won'
-- contaminaria qualquer métrica de conversão.
UPDATE public.stages
   SET kind = 'won'
 WHERE kind = 'open'
   AND name ~* '^(venda|ganho|fechad|conclu|vendido|won|closed won)';

UPDATE public.stages
   SET kind = 'lost'
 WHERE kind = 'open'
   AND name ~* '^(perdid|perda|descartad|lost|closed lost)';

-- Etapa de entrada: a primeira do funil de cada empresa que ainda não tem uma.
WITH first_stage AS (
  SELECT DISTINCT ON (company_id) id, company_id
    FROM public.stages
   WHERE kind = 'open'
   ORDER BY company_id, order_index, created_at
)
UPDATE public.stages s
   SET is_entry = true
  FROM first_stage f
 WHERE s.id = f.id
   AND NOT EXISTS (
     SELECT 1 FROM public.stages e
      WHERE e.company_id = s.company_id AND e.is_entry
   );

-- ---------------------------------------------------------------------------
-- 3. Backfill dos leads sem etapa
-- ---------------------------------------------------------------------------

-- Traduz o `status` antigo para a etapa correspondente da empresa. A ordem do
-- funil é a chave: 'contacted' vai para a segunda etapa, seja ela "Contato",
-- "Primeiro contato" ou "Abordagem". Quem não casar cai na etapa de entrada —
-- visível e corrigível, ao contrário de NULL, que some da tela.
WITH target AS (
  SELECT
    l.id AS lead_id,
    COALESCE(
      -- ganho e perdido têm etapa própria, independente da posição
      CASE
        WHEN lower(coalesce(l.status, '')) IN ('won', 'ganho') THEN (
          SELECT s.id FROM public.stages s
           WHERE s.company_id = l.company_id AND s.kind = 'won'
           ORDER BY s.order_index LIMIT 1
        )
        WHEN lower(coalesce(l.status, '')) IN ('lost', 'perdido') THEN (
          SELECT s.id FROM public.stages s
           WHERE s.company_id = l.company_id AND s.kind = 'lost'
           ORDER BY s.order_index LIMIT 1
        )
      END,
      -- demais status: pela posição no funil
      (
        SELECT s.id FROM public.stages s
         WHERE s.company_id = l.company_id
           AND s.kind = 'open'
           AND s.order_index = CASE lower(coalesce(l.status, 'new'))
                                 WHEN 'contacted' THEN 1
                                 WHEN 'contatado'  THEN 1
                                 WHEN 'qualified'  THEN 2
                                 WHEN 'qualificado' THEN 2
                                 WHEN 'proposal'   THEN 4
                                 WHEN 'proposta'   THEN 4
                                 ELSE 0
                               END
         ORDER BY s.created_at LIMIT 1
      ),
      -- nada casou: etapa de entrada
      (
        SELECT s.id FROM public.stages s
         WHERE s.company_id = l.company_id AND s.is_entry LIMIT 1
      )
    ) AS stage_id
  FROM public.leads l
  WHERE l.stage_id IS NULL
)
UPDATE public.leads l
   SET stage_id = t.stage_id
  FROM target t
 WHERE l.id = t.lead_id
   AND t.stage_id IS NOT NULL;

-- Quando o lead entrou na etapa. Para os já existentes não há histórico, então
-- vale a data de cadastro — é a única informação verdadeira que temos.
UPDATE public.leads
   SET stage_entered_at = created_at
 WHERE stage_entered_at IS NULL;

-- Ordem inicial: mais recente no topo, que é a ordem em que o corretor quer
-- atacar a fila. Espaçado de 1000 para caber inserção entre dois cards.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY company_id, stage_id ORDER BY created_at DESC
         ) * 1000.0 AS pos
    FROM public.leads
   WHERE board_order IS NULL
)
UPDATE public.leads l
   SET board_order = r.pos
  FROM ranked r
 WHERE l.id = r.id;
