-- Motivo da perda, configurável por empresa.
--
-- Hoje não existe campo de motivo em lugar nenhum: procurei por reason/motiv/
-- lost em todas as colunas do schema em 03/10 e o que há é fila de erro, score
-- e opt-out de WhatsApp. Perder um lead não deixa rastro do porquê.
--
-- Isso é o que impede o público de lead perdido de servir para alguma coisa.
-- "Sem orçamento agora" volta em seis meses; "não era o perfil" não volta
-- nunca. Um balde só mistura os dois e só serve para exclusão.
--
-- A lista é por empresa e não vem semeada: cada nicho perde por motivos
-- diferentes, e uma lista genérica seria ignorada ou preenchida errado.

create table if not exists public.loss_reasons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  order_index int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Dois motivos com o mesmo nome na mesma empresa não distinguem nada. Parcial
-- para o inativo não bloquear a reutilização de um nome que saiu de uso.
create unique index if not exists loss_reasons_nome_unico
  on public.loss_reasons (company_id, lower(btrim(label))) where is_active;

create index if not exists loss_reasons_empresa_idx
  on public.loss_reasons (company_id, order_index);

alter table public.loss_reasons enable row level security;
drop policy if exists loss_reasons_membro on public.loss_reasons;
create policy loss_reasons_membro on public.loss_reasons
  for all using (check_membership(company_id)) with check (check_membership(company_id));

-- O motivo vive no lead porque é a verdade atual: ele pode ser corrigido
-- depois sem reescrever o passado, que fica no histórico.
alter table public.leads
  add column if not exists loss_reason_id uuid references public.loss_reasons(id) on delete set null,
  add column if not exists lost_notes text;

comment on column public.leads.lost_notes is
  'Observação livre sobre a perda. O motivo da lista responde "qual categoria"; isto responde "o que de fato aconteceu".';

-- Fotografia do motivo no instante do movimento. O da linha do lead pode ser
-- corrigido depois; este é o que valia na hora, e é o que vale para montar
-- público retroativo.
alter table public.lead_stage_history
  add column if not exists loss_reason_name text;

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
  v_motivo text;
begin
  if (tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id) then
    return new;
  end if;

  if (tg_op = 'UPDATE' and old.stage_id is not null) then
    select s.name, s.order_index into v_de from public.stages s where s.id = old.stage_id;
  end if;

  if new.stage_id is not null then
    select s.name, s.order_index into v_para from public.stages s where s.id = new.stage_id;
  end if;

  -- Lido de NEW: quando a tela grava etapa e motivo no MESMO update — que é o
  -- que ela faz — o motivo já chegou aqui.
  if new.loss_reason_id is not null then
    select r.label into v_motivo from public.loss_reasons r where r.id = new.loss_reason_id;
  end if;

  v_origem := nullif(current_setting('app.origem_do_movimento', true), '');

  insert into public.lead_stage_history (
    company_id, lead_id,
    from_stage_id, from_stage_name, from_order_index,
    to_stage_id, to_stage_name, to_order_index,
    moved_by, origem, loss_reason_name
  ) values (
    new.company_id, new.id,
    case when tg_op = 'UPDATE' then old.stage_id end, v_de.name, v_de.order_index,
    new.stage_id, v_para.name, v_para.order_index,
    auth.uid(), v_origem, v_motivo
  );

  return new;
end;
$$;

/**
 * Leads perdidos com profundidade e motivo — a consulta que o público precisa.
 *
 * Devolve até onde cada um chegou antes de cair. É a diferença entre "perdeu
 * em Primeiro contato" e "perdeu em Proposta enviada": o segundo qualificou,
 * engajou, e se perdeu por preço ou prazo. Esse é o perfil que se quer MAIS.
 */
create or replace function public.leads_perdidos_com_profundidade(p_company_id uuid)
returns table (
  lead_id uuid,
  nome text,
  email text,
  phone text,
  motivo text,
  profundidade_maxima int,
  etapa_mais_funda text,
  perdido_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.name,
    l.email,
    l.phone,
    r.label,
    public.profundidade_maxima_do_lead(l.id),
    (select h.to_stage_name from public.lead_stage_history h
      where h.lead_id = l.id
      order by h.to_order_index desc nulls last, h.moved_at desc limit 1),
    l.stage_entered_at
  from public.leads l
  join public.stages s on s.id = l.stage_id
  left join public.loss_reasons r on r.id = l.loss_reason_id
  where l.company_id = p_company_id
    and s.kind = 'lost'
    and public.check_membership(l.company_id)
  order by public.profundidade_maxima_do_lead(l.id) desc;
$$;

comment on table public.loss_reasons is
  'Motivos de perda da empresa. Lista própria por nicho — não vem semeada de propósito.';
