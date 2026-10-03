-- Histórico de etapas do lead.
--
-- Hoje a única coisa que registra movimento é um insert em `lead_events` feito
-- pela tela do Kanban. Isso deixa três buracos medidos em 03/10: a tabela tinha
-- 4 linhas no total, o espelhamento etiqueta → etapa não grava nada, e a etapa
-- de origem só existe dentro de uma frase em português ("Movido de X para Y").
--
-- Um gatilho resolve os três de uma vez: ele não depende de qual caminho mexeu
-- no lead. Kanban, etiqueta do WhatsApp, automação, importação, correção manual
-- no banco — todos passam pelo UPDATE, então todos ficam registrados.
--
-- Sem isto não há resposta para "até onde esse lead chegou antes de ser
-- perdido?", que é a pergunta que dá valor a público de perdidos: quem caiu em
-- "Proposta enviada" é o perfil que se quer MAIS, não menos.

create table if not exists public.lead_stage_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,

  -- Id E nome E posição, os três gravados no momento do movimento.
  --
  -- Guardar só o id tornaria o histórico mentiroso: etapa pode ser renomeada,
  -- reordenada ou excluída, e aí uma leitura de seis meses atrás passaria a
  -- descrever um funil que não era aquele. O id serve para juntar enquanto a
  -- etapa existe; o nome e a posição preservam o que de fato aconteceu.
  from_stage_id uuid references public.stages(id) on delete set null,
  from_stage_name text,
  from_order_index int,
  to_stage_id uuid references public.stages(id) on delete set null,
  to_stage_name text,
  to_order_index int,

  -- Quem mexeu. Nulo quando veio do servidor (cron, webhook, etiqueta) em vez
  -- de uma pessoa logada — e essa distinção é informação, não falta de dado.
  moved_by uuid,
  -- Preenchido por quem quiser se identificar, via
  -- `set_config('app.origem_do_movimento', 'etiqueta', true)`.
  origem text,
  moved_at timestamptz not null default now()
);

create index if not exists lead_stage_history_lead_idx
  on public.lead_stage_history (lead_id, moved_at);
create index if not exists lead_stage_history_company_idx
  on public.lead_stage_history (company_id, moved_at desc);

alter table public.lead_stage_history enable row level security;

drop policy if exists "membros leem o historico da empresa" on public.lead_stage_history;
create policy "membros leem o historico da empresa"
  on public.lead_stage_history for select
  using (check_membership(company_id));

-- Sem policy de INSERT de propósito: só o gatilho escreve, e ele é SECURITY
-- DEFINER. Histórico que a aplicação pode editar não é histórico.

create or replace function public.registrar_movimento_de_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_de record;
  v_para record;
  v_origem text;
begin
  -- No INSERT a "origem" é não ter etapa nenhuma: é o início do caminho, e
  -- precisa estar aqui para a profundidade de um lead que nunca se moveu ser
  -- legível sem adivinhação.
  if (tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id) then
    return new;
  end if;

  if (tg_op = 'UPDATE' and old.stage_id is not null) then
    select s.name, s.order_index into v_de from public.stages s where s.id = old.stage_id;
  end if;

  if new.stage_id is not null then
    select s.name, s.order_index into v_para from public.stages s where s.id = new.stage_id;
  end if;

  -- `true` no segundo argumento: devolve nulo em vez de estourar quando a
  -- variável não foi definida, que é o caso da grande maioria dos caminhos.
  v_origem := nullif(current_setting('app.origem_do_movimento', true), '');

  insert into public.lead_stage_history (
    company_id, lead_id,
    from_stage_id, from_stage_name, from_order_index,
    to_stage_id, to_stage_name, to_order_index,
    moved_by, origem
  ) values (
    new.company_id, new.id,
    case when tg_op = 'UPDATE' then old.stage_id end, v_de.name, v_de.order_index,
    new.stage_id, v_para.name, v_para.order_index,
    auth.uid(), v_origem
  );

  return new;
end;
$$;

drop trigger if exists leads_historico_de_etapa on public.leads;
create trigger leads_historico_de_etapa
  after insert or update of stage_id on public.leads
  for each row execute function public.registrar_movimento_de_etapa();

/**
 * Profundidade máxima que o lead alcançou.
 *
 * Lê o histórico E a etapa atual. Os dois, porque o histórico começa hoje: um
 * lead parado desde julho não tem linha nenhuma, e ignorar a etapa atual diria
 * que ele nunca chegou a lugar algum. Nada é inventado para trás — o que não
 * foi medido simplesmente não entra.
 */
create or replace function public.profundidade_maxima_do_lead(p_lead_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    coalesce((select max(h.to_order_index) from public.lead_stage_history h
               where h.lead_id = p_lead_id), -1),
    coalesce((select s.order_index from public.leads l
                join public.stages s on s.id = l.stage_id
               where l.id = p_lead_id), -1)
  );
$$;

comment on table public.lead_stage_history is
  'Toda mudança de etapa, gravada por gatilho para não depender do caminho que mexeu no lead. Nome e posição da etapa são fotografados no momento do movimento.';
