-- Completar o motivo de um lead já perdido.
--
-- O diálogo de perda só dispara na mudança de etapa. Quem perdeu um lead sem
-- preencher — porque a aba estava com código antigo, porque pulou, porque o
-- motivo só ficou claro no dia seguinte — não tinha como voltar e registrar.
-- O caso apareceu em produção no primeiro uso.

create or replace function public.definir_motivo_da_perda(
  p_lead_id uuid,
  p_reason_id uuid,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_kind text;
  v_label text;
  v_historico uuid;
begin
  select l.company_id, s.kind into v_company, v_kind
    from public.leads l
    join public.stages s on s.id = l.stage_id
   where l.id = p_lead_id;

  if v_company is null then
    raise exception 'Lead não encontrado.';
  end if;

  -- SECURITY DEFINER passa por cima da RLS, então a checagem tem que ser
  -- explícita: sem isto qualquer pessoa autenticada editaria lead de outra
  -- empresa só sabendo o id.
  if not public.check_membership(v_company) then
    raise exception 'Sem acesso a este lead.';
  end if;

  if v_kind is distinct from 'lost' then
    raise exception 'Este lead não está numa etapa de perda.';
  end if;

  select r.label into v_label
    from public.loss_reasons r
   where r.id = p_reason_id and r.company_id = v_company;

  if v_label is null then
    raise exception 'Motivo não pertence a esta empresa.';
  end if;

  update public.leads
     set loss_reason_id = p_reason_id,
         lost_notes = nullif(btrim(coalesce(p_notes, '')), ''),
         updated_at = now()
   where id = p_lead_id;

  -- A linha do histórico só é COMPLETADA, nunca reescrita.
  --
  -- A fotografia existe para dizer o que valia no momento do movimento. Trocar
  -- um motivo já gravado apagaria isso. Mas uma fotografia vazia não registra
  -- nada — ela é ausência, não um fato a preservar —, então preenchê-la
  -- completa o registro em vez de falsificá-lo.
  select h.id into v_historico
    from public.lead_stage_history h
   where h.lead_id = p_lead_id
     and h.to_stage_kind = 'lost'
     and h.loss_reason_name is null
   order by h.moved_at desc
   limit 1;

  if v_historico is not null then
    update public.lead_stage_history
       set loss_reason_name = v_label
     where id = v_historico;
  end if;
end;
$$;
