-- Direitos do titular: acesso (art. 18, II) e eliminação (art. 18, VI)
--
-- O que existia em `lgpdService`, medido em 04/10/2026:
--
--   exportData    seleciona `lead_tracking(*)` — tabela que NÃO EXISTE. A
--                 consulta quebraria em toda chamada.
--   deleteData    apaga o lead e grava em `audit_logs` um campo `metadata`,
--                 que não existe nessa tabela (a coluna é `changes`), e sem
--                 `company_id`, que é NOT NULL. O registro da auditoria
--                 falharia — e o `delete` do lead já teria acontecido, então
--                 o dado sumia sem rastro de quem pediu.
--   recordConsent mesma falha de `metadata`/`company_id`.
--
-- Nenhum dos três tinha chamador, então nada disso aparecia.

-- ---------------------------------------------------------------------------
-- 1. A prova do consentimento precisa SOBREVIVER à eliminação
-- ---------------------------------------------------------------------------
--
-- `lead_consents.lead_id` era `on delete cascade`: apagar o lead apagava junto
-- a prova de que ele havia consentido. Isso inviabiliza demonstrar que o
-- tratamento foi lícito no período anterior ao pedido — e o art. 16 permite
-- justamente conservar o necessário para cumprimento de obrigação legal.
--
-- `lead_ref` guarda o identificador antigo SEM chave estrangeira, para ligar o
-- registro ao pedido de eliminação. Não é dado pessoal: é um uuid interno que,
-- sozinho, não identifica ninguém depois que o lead deixou de existir.

alter table public.lead_consents add column if not exists lead_ref uuid;
update public.lead_consents set lead_ref = lead_id where lead_ref is null;

alter table public.lead_consents drop constraint if exists lead_consents_lead_id_fkey;
alter table public.lead_consents
  add constraint lead_consents_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete set null;

comment on column public.lead_consents.lead_ref is
  'Id do lead antes de uma eventual eliminação. Mantém a prova ligável ao pedido.';

-- ---------------------------------------------------------------------------
-- 2. Registro dos pedidos
-- ---------------------------------------------------------------------------

create table if not exists public.solicitacoes_do_titular (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_ref uuid not null,
  tipo text not null check (tipo in ('acesso', 'eliminacao')),
  solicitado_por uuid,
  -- O que foi removido, em CONTAGEM e não em conteúdo: guardar o dado apagado
  -- dentro do registro da eliminação seria não ter eliminado nada.
  resumo jsonb,
  motivo text,
  created_at timestamptz not null default now()
);

create index if not exists solicitacoes_do_titular_empresa_idx
  on public.solicitacoes_do_titular (company_id, created_at desc);

alter table public.solicitacoes_do_titular enable row level security;

drop policy if exists "Solicitações da empresa" on public.solicitacoes_do_titular;
create policy "Solicitações da empresa" on public.solicitacoes_do_titular
  for select to authenticated using (check_membership(company_id));

grant select on public.solicitacoes_do_titular to authenticated;

comment on table public.solicitacoes_do_titular is
  'Pedidos de acesso e de eliminação de dados. Contagens, nunca o conteúdo apagado.';

-- ---------------------------------------------------------------------------
-- 3. Acesso (art. 18, II) — tudo o que a empresa guarda sobre a pessoa
-- ---------------------------------------------------------------------------

create or replace function public.exportar_dados_do_titular(p_lead_id uuid)
returns jsonb
language plpgsql
-- VOLATILE (o padrão), e não `stable`: a função GRAVA o pedido de acesso em
-- `solicitacoes_do_titular`. Marcada como `stable` o Postgres recusa com
-- "INSERT is not allowed in a non-volatile function".
security definer
set search_path to 'public'
as $$
declare
  v_lead leads;
  v_saida jsonb;
begin
  select * into v_lead from leads where id = p_lead_id;
  if v_lead.id is null then
    raise exception 'lead não encontrado' using errcode = 'P0002';
  end if;
  if not check_membership(v_lead.company_id) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'gerado_em', now(),
    'lead', to_jsonb(v_lead),
    'historico_de_etapas', coalesce((select jsonb_agg(to_jsonb(h) order by h.moved_at)
       from lead_stage_history h where h.lead_id = p_lead_id), '[]'::jsonb),
    'eventos', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at)
       from lead_events e where e.lead_id = p_lead_id), '[]'::jsonb),
    'etiquetas', coalesce((select jsonb_agg(t.tag_name)
       from lead_tags t where t.lead_id = p_lead_id), '[]'::jsonb),
    'anotacoes', coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at)
       from lead_notes n where n.lead_id = p_lead_id), '[]'::jsonb),
    'respostas_de_formulario', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at)
       from form_submissions s where s.lead_id = p_lead_id), '[]'::jsonb),
    'rascunhos', coalesce((select jsonb_agg(to_jsonb(p) order by p.updated_at)
       from form_partial_submissions p where p.lead_id = p_lead_id), '[]'::jsonb),
    'consentimentos', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at)
       from lead_consents c where c.lead_id = p_lead_id or c.lead_ref = p_lead_id), '[]'::jsonb),
    'mensagens_de_whatsapp', coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at)
       from whatsapp_messages m where m.lead_id = p_lead_id), '[]'::jsonb),
    'eventos_de_meta', coalesce((select jsonb_agg(to_jsonb(me) order by me.created_at)
       from meta_lead_events me where me.lead_id = p_lead_id), '[]'::jsonb)
  ) into v_saida;

  insert into solicitacoes_do_titular (company_id, lead_ref, tipo, solicitado_por)
  values (v_lead.company_id, p_lead_id, 'acesso', auth.uid());

  return v_saida;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Eliminação (art. 18, VI)
-- ---------------------------------------------------------------------------
--
-- Conta ANTES de apagar. Depois do `delete` as linhas filhas já foram embora
-- em cascata e não haveria o que contar — o registro do pedido diria zero e
-- ninguém saberia o que foi removido.

create or replace function public.eliminar_dados_do_titular(
  p_lead_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lead leads;
  v_resumo jsonb;
begin
  select * into v_lead from leads where id = p_lead_id;
  if v_lead.id is null then
    raise exception 'lead não encontrado' using errcode = 'P0002';
  end if;
  if not check_membership(v_lead.company_id) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;

  v_resumo := jsonb_build_object(
    'tinha_nome', v_lead.name is not null,
    'tinha_email', v_lead.email is not null,
    'tinha_telefone', v_lead.phone is not null,
    'criado_em', v_lead.created_at,
    'eventos', (select count(*) from lead_events where lead_id = p_lead_id),
    'etiquetas', (select count(*) from lead_tags where lead_id = p_lead_id),
    'anotacoes', (select count(*) from lead_notes where lead_id = p_lead_id),
    'respostas_de_formulario', (select count(*) from form_submissions where lead_id = p_lead_id),
    'rascunhos', (select count(*) from form_partial_submissions where lead_id = p_lead_id),
    'mensagens_de_whatsapp', (select count(*) from whatsapp_messages where lead_id = p_lead_id),
    'consentimentos_preservados', (select count(*) from lead_consents where lead_id = p_lead_id)
  );

  insert into solicitacoes_do_titular (company_id, lead_ref, tipo, solicitado_por, resumo, motivo)
  values (v_lead.company_id, p_lead_id, 'eliminacao', auth.uid(), v_resumo, nullif(btrim(p_motivo), ''));

  -- O `on delete set null` guarda a prova; `lead_ref` mantém o vínculo com o
  -- pedido acima. As demais tabelas caem em cascata, que é o esperado.
  delete from leads where id = p_lead_id;

  return jsonb_build_object('ok', true, 'removido', v_resumo);
end;
$$;

revoke all on function public.exportar_dados_do_titular(uuid) from public;
revoke all on function public.eliminar_dados_do_titular(uuid, text) from public;
grant execute on function public.exportar_dados_do_titular(uuid) to authenticated;
grant execute on function public.eliminar_dados_do_titular(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. `lead_ref` preenchido sempre, por gatilho
-- ---------------------------------------------------------------------------
--
-- Achado no teste de aceite: a eliminação zerava o `lead_id` (como projetado)
-- mas o `lead_ref` nunca tinha sido preenchido — `form_submit_publico` grava o
-- consentimento sem ele. O resultado era a pior combinação possível: a linha
-- sobrevivia com os DOIS campos nulos, impossível de ligar ao pedido de
-- eliminação. Prova que não se pode vincular a nada não prova nada.
--
-- Gatilho em vez de acertar a função de envio: garante o preenchimento venha o
-- insert de onde vier, inclusive de código escrito depois.

create or replace function public.preencher_lead_ref_do_consentimento()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.lead_ref := coalesce(new.lead_ref, new.lead_id);
  return new;
end;
$$;

drop trigger if exists lead_consents_preenche_ref on public.lead_consents;
create trigger lead_consents_preenche_ref
  before insert on public.lead_consents
  for each row execute function public.preencher_lead_ref_do_consentimento();
