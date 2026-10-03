-- Profundidade deve medir o funil ABERTO, não a posição na lista de etapas.
--
-- Defeito pego em teste antes de ir para produção: "Perdido" tem order_index 6,
-- depois de "Venda fechada". Como a conta olhava qualquer etapa, todo lead
-- perdido marcava profundidade 6 — o número não distinguia "perdeu no primeiro
-- contato" de "perdeu com a proposta na mesa", que é a única coisa que ele
-- existe para distinguir.
--
-- Etapa de ganho e de perda são desfechos, não degraus. A profundidade é o
-- degrau mais fundo do funil aberto que o lead alcançou antes de sair dele.

alter table public.lead_stage_history
  add column if not exists from_stage_kind text,
  add column if not exists to_stage_kind text;

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
    select s.name, s.order_index, s.kind into v_de
      from public.stages s where s.id = old.stage_id;
  end if;

  if new.stage_id is not null then
    select s.name, s.order_index, s.kind into v_para
      from public.stages s where s.id = new.stage_id;
  end if;

  if new.loss_reason_id is not null then
    select r.label into v_motivo from public.loss_reasons r where r.id = new.loss_reason_id;
  end if;

  v_origem := nullif(current_setting('app.origem_do_movimento', true), '');

  insert into public.lead_stage_history (
    company_id, lead_id,
    from_stage_id, from_stage_name, from_order_index, from_stage_kind,
    to_stage_id, to_stage_name, to_order_index, to_stage_kind,
    moved_by, origem, loss_reason_name
  ) values (
    new.company_id, new.id,
    case when tg_op = 'UPDATE' then old.stage_id end, v_de.name, v_de.order_index, v_de.kind,
    new.stage_id, v_para.name, v_para.order_index, v_para.kind,
    auth.uid(), v_origem, v_motivo
  );

  return new;
end;
$$;

create or replace function public.profundidade_maxima_do_lead(p_lead_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    -- Histórico: só os degraus abertos por onde passou. `to_stage_kind` pode
    -- ser nulo em linhas gravadas antes desta migração, então cai para a etapa
    -- ainda existente — e se ela sumiu, a linha simplesmente não conta.
    coalesce((
      select max(h.to_order_index) from public.lead_stage_history h
        left join public.stages s on s.id = h.to_stage_id
       where h.lead_id = p_lead_id
         and coalesce(h.to_stage_kind, s.kind) = 'open'
    ), -1),
    -- E onde ele está agora, se ainda for um degrau aberto.
    coalesce((
      select s.order_index from public.leads l
        join public.stages s on s.id = l.stage_id
       where l.id = p_lead_id and s.kind = 'open'
    ), -1)
  );
$$;

-- A assinatura mudou (ganhou `observacao`), e o Postgres não troca o tipo de
-- retorno num replace.
drop function if exists public.leads_perdidos_com_profundidade(uuid);

create function public.leads_perdidos_com_profundidade(p_company_id uuid)
returns table (
  lead_id uuid,
  nome text,
  email text,
  phone text,
  motivo text,
  observacao text,
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
    l.lost_notes,
    public.profundidade_maxima_do_lead(l.id),
    -- O nome do degrau aberto mais fundo, pela mesma régua.
    (select h.to_stage_name
       from public.lead_stage_history h
       left join public.stages s2 on s2.id = h.to_stage_id
      where h.lead_id = l.id
        and coalesce(h.to_stage_kind, s2.kind) = 'open'
      order by h.to_order_index desc nulls last, h.moved_at desc
      limit 1),
    l.stage_entered_at
  from public.leads l
  join public.stages s on s.id = l.stage_id
  left join public.loss_reasons r on r.id = l.loss_reason_id
  where l.company_id = p_company_id
    and s.kind = 'lost'
    and public.check_membership(l.company_id)
  order by public.profundidade_maxima_do_lead(l.id) desc;
$$;
