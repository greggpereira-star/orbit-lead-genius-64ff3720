-- Motor de automação
--
-- O que existia, medido em 04/10/2026: NADA no banco. Zero tabelas com nome
-- `automation%`, zero `dead_letter_queue`. E no código, duas fachadas com
-- schemas incompatíveis entre si:
--
--   automationService.ts  consultava `automations` e `automation_runs`
--   automationEngine.ts   consultava `automation_rules`, `automation_conditions`,
--                         `automation_actions`, `automation_executions`,
--                         `dead_letter_queue`
--
-- Nenhuma das duas conferia o erro da consulta, então ambas saíam caladas a
-- cada captura de lead. A tela `/automations` mostrava dois workflows
-- escritos no próprio componente, e o botão "Deploy Rule" só emitia um toast.
--
-- Esta migração constrói o motor seguindo o padrão que este repositório já
-- provou com `conversion_dispatches`: o gatilho ENFILEIRA no banco e um
-- trabalhador no servidor executa. A razão é a mesma de lá — as ações precisam
-- de segredo (chave da Evolution, webhook do Slack) que não pode viver no
-- navegador, e chamar API externa dentro da transação do lead prenderia a
-- gravação na latência da rede.

-- ---------------------------------------------------------------------------
-- 1. Regras
-- ---------------------------------------------------------------------------

create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  descricao text,
  -- Vocabulário fechado: um evento escrito errado criaria uma regra que nunca
  -- dispara, e nada avisaria.
  trigger_event text not null check (trigger_event in (
    'lead_created',
    'stage_changed',
    'form_abandoned'
  )),
  -- [{ "campo": "score", "operador": "maior_que", "valor": "60" }, ...]
  -- Vazio = sem condição, a regra vale para todo evento do tipo.
  conditions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  -- Maior primeiro. Importa quando duas regras agem sobre o mesmo lead.
  priority int not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_rules_lookup_idx
  on public.automation_rules (company_id, trigger_event, is_active, priority desc);

-- ---------------------------------------------------------------------------
-- 2. Ações
-- ---------------------------------------------------------------------------

create table if not exists public.automation_actions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Só os tipos que o trabalhador realmente executa. Não há 'enviar_email'
  -- porque o projeto não tem remetente de e-mail nenhum — uma ação que só
  -- registra sucesso e não envia nada é pior que não existir.
  action_type text not null check (action_type in (
    'etiquetar',
    'mover_etapa',
    'atribuir_responsavel',
    'enviar_whatsapp',
    'webhook'
  )),
  config jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists automation_actions_rule_idx
  on public.automation_actions (rule_id, sort_order);

-- ---------------------------------------------------------------------------
-- 3. Fila
-- ---------------------------------------------------------------------------

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  trigger_event text not null,
  lead_id uuid references public.leads(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed')),
  attempts int not null default 0,
  last_error text,
  -- O mesmo evento não enfileira duas vezes. Para `stage_changed` a chave
  -- inclui a etapa de destino, porque mover e voltar são dois eventos
  -- legítimos do mesmo lead.
  dedup_key text not null,
  resultado jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create unique index if not exists automation_jobs_dedup_uniq
  on public.automation_jobs (dedup_key);
create index if not exists automation_jobs_fila_idx
  on public.automation_jobs (status, attempts, created_at);
create index if not exists automation_jobs_lead_idx
  on public.automation_jobs (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

alter table public.automation_rules enable row level security;
alter table public.automation_actions enable row level security;
alter table public.automation_jobs enable row level security;

drop policy if exists "Regras da empresa" on public.automation_rules;
create policy "Regras da empresa" on public.automation_rules
  for all to authenticated
  using (check_membership(company_id)) with check (check_membership(company_id));

drop policy if exists "Ações da empresa" on public.automation_actions;
create policy "Ações da empresa" on public.automation_actions
  for all to authenticated
  using (check_membership(company_id)) with check (check_membership(company_id));

-- A fila é só leitura para quem opera: quem escreve nela é o gatilho (que roda
-- como dono) e o trabalhador (que usa a chave de serviço). Um operador que
-- pudesse editar a fila poderia marcar um job como feito sem ele ter rodado.
drop policy if exists "Fila visível para a empresa" on public.automation_jobs;
create policy "Fila visível para a empresa" on public.automation_jobs
  for select to authenticated using (check_membership(company_id));

grant select, insert, update, delete on public.automation_rules to authenticated;
grant select, insert, update, delete on public.automation_actions to authenticated;
grant select on public.automation_jobs to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Condições
-- ---------------------------------------------------------------------------
--
-- Avaliadas em SQL, no momento de enfileirar. Assim uma regra que não casa não
-- gera job nenhum — a fila fica com o que realmente vai agir, e não com
-- milhares de linhas `skipped`.

create or replace function public.automacao_condicoes_passam(
  p_conditions jsonb,
  p_payload jsonb
)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  -- Sem condição, passa. `bool_and` de conjunto vazio é null, daí o coalesce.
  select coalesce(bool_and(
    case c ->> 'operador'
      when 'igual'        then (p_payload ->> (c ->> 'campo')) = (c ->> 'valor')
      when 'diferente'    then (p_payload ->> (c ->> 'campo')) is distinct from (c ->> 'valor')
      when 'contem'       then coalesce(c ->> 'valor', '') <> ''
                               and position(lower(c ->> 'valor')
                                   in lower(coalesce(p_payload ->> (c ->> 'campo'), ''))) > 0
      when 'maior_que'    then (p_payload ->> (c ->> 'campo')) ~ '^-?[0-9]+(\.[0-9]+)?$'
                               and (c ->> 'valor') ~ '^-?[0-9]+(\.[0-9]+)?$'
                               and (p_payload ->> (c ->> 'campo'))::numeric > (c ->> 'valor')::numeric
      when 'menor_que'    then (p_payload ->> (c ->> 'campo')) ~ '^-?[0-9]+(\.[0-9]+)?$'
                               and (c ->> 'valor') ~ '^-?[0-9]+(\.[0-9]+)?$'
                               and (p_payload ->> (c ->> 'campo'))::numeric < (c ->> 'valor')::numeric
      when 'preenchido'   then coalesce(btrim(p_payload ->> (c ->> 'campo')), '') <> ''
      when 'vazio'        then coalesce(btrim(p_payload ->> (c ->> 'campo')), '') = ''
      -- Operador desconhecido NÃO passa. O contrário faria uma regra mal
      -- configurada agir sobre todos os leads.
      else false
    end
  ), true)
  from jsonb_array_elements(coalesce(p_conditions, '[]'::jsonb)) c;
$$;

-- ---------------------------------------------------------------------------
-- 6. Enfileirar
-- ---------------------------------------------------------------------------

create or replace function public.enfileirar_automacao(
  p_company_id uuid,
  p_evento text,
  p_lead_id uuid,
  p_payload jsonb default '{}'::jsonb,
  p_sufixo_dedup text default ''
)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inseridos int := 0;
begin
  insert into automation_jobs (company_id, rule_id, trigger_event, lead_id, payload, dedup_key)
  select
    r.company_id, r.id, p_evento, p_lead_id, coalesce(p_payload, '{}'::jsonb),
    r.id::text || ':' || coalesce(p_lead_id::text, 'sem-lead') || ':' || coalesce(p_sufixo_dedup, '')
  from automation_rules r
  where r.company_id = p_company_id
    and r.trigger_event = p_evento
    and r.is_active
    -- A regra sem ação nenhuma não é enfileirada: rodaria para não fazer nada.
    and exists (select 1 from automation_actions a where a.rule_id = r.id)
    and automacao_condicoes_passam(r.conditions, coalesce(p_payload, '{}'::jsonb))
  on conflict (dedup_key) do nothing;

  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Gatilhos
-- ---------------------------------------------------------------------------
--
-- No BANCO, e não no cliente. O `automationService.processTrigger` era chamado
-- só pelo `captureService`, então lead que entrasse pelo quiz, pelo chat, pelo
-- WhatsApp ou pelo painel nunca disparava automação nenhuma. Aqui todo caminho
-- de criação de lead passa pelo mesmo ponto.
--
-- `exception when others` em volta de tudo é obrigatório: o gatilho de
-- histórico de etapa já quebrou todo insert de lead por 24 horas em 03/10
-- justamente por não ter essa proteção. Automação é acessório; perder o lead
-- não é.

create or replace function public.disparar_automacao_de_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_payload jsonb;
  v_etapa text;
begin
  begin
    if tg_op = 'INSERT' then
      v_payload := jsonb_build_object(
        'lead_id', new.id, 'nome', new.name, 'email', new.email, 'telefone', new.phone,
        'score', new.score, 'temperatura', new.temperature, 'origem', new.source,
        'utm_source', new.utm_source, 'utm_campaign', new.utm_campaign,
        'utm_medium', new.utm_medium, 'landing_page', new.landing_page
      );
      perform enfileirar_automacao(new.company_id, 'lead_created', new.id, v_payload, 'criado');
    else
      select s.name into v_etapa from stages s where s.id = new.stage_id;
      v_payload := jsonb_build_object(
        'lead_id', new.id, 'nome', new.name, 'email', new.email, 'telefone', new.phone,
        'score', new.score, 'temperatura', new.temperature,
        'etapa', v_etapa, 'etapa_id', new.stage_id, 'etapa_anterior_id', old.stage_id
      );
      perform enfileirar_automacao(
        new.company_id, 'stage_changed', new.id, v_payload,
        -- Mover e voltar são dois eventos legítimos. A etapa de destino entra
        -- na chave para que o segundo não seja descartado como repetido.
        'etapa:' || coalesce(new.stage_id::text, 'nenhuma')
      );
    end if;
  exception when others then
    raise warning 'enfileirar automação falhou para o lead %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists leads_automacao on public.leads;
create trigger leads_automacao
  after insert or update of stage_id on public.leads
  for each row execute function public.disparar_automacao_de_lead();

-- Abandono de formulário: o evento que a migração 20261004150000 passou a
-- detectar e que até agora não tinha para onde ir.
create or replace function public.marcar_rascunhos_abandonados(
  p_minutos int default 30
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_abandonados int;
  v_expirados int;
  v_enfileirados int := 0;
  v_r record;
begin
  with recem as (
    update form_partial_submissions
    set status = 'abandoned', updated_at = now()
    where status in ('started', 'in_progress')
      and updated_at < now() - make_interval(mins => greatest(p_minutos, 1))
    returning id, company_id, form_id, form_slug, session_id, answers,
              current_step_index, score_preview, temperature_preview, tracking
  )
  select count(*) into v_abandonados from recem;

  update form_partial_submissions
  set status = 'expired', updated_at = now()
  where status <> 'completed' and status <> 'expired'
    and expires_at is not null and expires_at < now();
  get diagnostics v_expirados = row_count;

  -- Enfileira depois de marcar, para não depender da ordem do CTE.
  for v_r in
    select p.id, p.company_id, p.form_slug, p.session_id, p.answers,
           p.current_step_index, p.score_preview, p.temperature_preview, p.tracking
    from form_partial_submissions p
    where p.status = 'abandoned'
      and p.updated_at > now() - interval '1 hour'
  loop
    begin
      v_enfileirados := v_enfileirados + enfileirar_automacao(
        v_r.company_id, 'form_abandoned', null,
        jsonb_build_object(
          'rascunho_id', v_r.id,
          'formulario', v_r.form_slug,
          'sessao', v_r.session_id,
          'passo', coalesce(v_r.current_step_index, 0) + 1,
          'score', coalesce(v_r.score_preview, 0),
          'temperatura', coalesce(v_r.temperature_preview, 'cold'),
          'respostas', coalesce(v_r.answers, '{}'::jsonb),
          'utm_source', nullif(v_r.tracking ->> 'utm_source', ''),
          'utm_campaign', nullif(v_r.tracking ->> 'utm_campaign', '')
        ),
        'rascunho:' || v_r.id::text
      );
    exception when others then
      raise warning 'enfileirar abandono falhou para o rascunho %: %', v_r.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'abandonados', v_abandonados,
    'expirados', v_expirados,
    'automacoes_enfileiradas', v_enfileirados
  );
end;
$$;

revoke all on function public.marcar_rascunhos_abandonados(int) from public;
grant execute on function public.marcar_rascunhos_abandonados(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Leitura da fila para a tela
-- ---------------------------------------------------------------------------

create or replace function public.automacao_execucoes(
  p_company_id uuid,
  p_limite int default 50
)
returns table (
  id uuid,
  regra text,
  evento text,
  lead_id uuid,
  lead_nome text,
  status text,
  tentativas int,
  erro text,
  resultado jsonb,
  criado_em timestamptz,
  terminado_em timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select j.id, r.name, j.trigger_event, j.lead_id, l.name, j.status,
         j.attempts, j.last_error, j.resultado, j.created_at, j.finished_at
  from automation_jobs j
  join automation_rules r on r.id = j.rule_id
  left join leads l on l.id = j.lead_id
  where j.company_id = p_company_id
    and check_membership(p_company_id)
  order by j.created_at desc
  limit greatest(coalesce(p_limite, 50), 1);
$$;

revoke all on function public.automacao_execucoes(uuid, int) from public;
grant execute on function public.automacao_execucoes(uuid, int) to authenticated;

comment on table public.automation_rules is 'Regras de automação. Gatilho enfileira, trabalhador executa.';
comment on table public.automation_jobs is 'Fila de automação. Só o gatilho e o trabalhador escrevem.';

-- ---------------------------------------------------------------------------
-- 9. `automacao` como tipo de mensagem de WhatsApp
-- ---------------------------------------------------------------------------
--
-- `whatsapp_messages.kind` aceitava `greeting | broker_alert | manual | reply`.
-- A mensagem disparada por regra de automação não é nenhum dos quatro — e a
-- tela que o cliente audita lê essa tabela, então a mensagem precisa aparecer
-- ali com o tipo certo, não disfarçada de `manual`.

alter table public.whatsapp_messages drop constraint if exists whatsapp_messages_kind_check;
alter table public.whatsapp_messages add constraint whatsapp_messages_kind_check
  check (kind in ('greeting', 'broker_alert', 'manual', 'reply', 'automacao'));
