-- Caminho público do formulário por RPC, e não por tabela
--
-- Medido em 04/10/2026, rodando como o papel `anon`:
--
--   select count(*) from forms;
--   ERROR:  permission denied for table forms
--
-- O papel `anon` tem grant em UMA tabela: `leads` (SELECT, INSERT). Não tem
-- nenhum em `forms`, `form_fields`, `form_field_options`, `form_submissions`,
-- `form_partial_submissions`, `form_scoring_rules`, `lead_tags` nem
-- `lead_events`. Como `formService.getFormBySlug` lia a tabela direto pelo
-- cliente anônimo, o formulário público NUNCA renderizava — caía em
-- "Formulário não encontrado" antes de qualquer outra coisa. É por isso que
-- havia 0 formulários, 0 submissões e 0 parciais em produção.
--
-- As políticas `{anon}` de `form_partial_submissions` eram letra morta pelo
-- mesmo motivo: política sem grant não autoriza nada.
--
-- A correção NÃO é conceder os oito grants. É a arquitetura que o quiz deste
-- mesmo repositório já usa: uma função `SECURITY DEFINER` por operação
-- pública. O visitante anônimo continua sem privilégio nenhum de tabela, e a
-- superfície exposta passa a ser exatamente o que estas funções fazem.

-- ---------------------------------------------------------------------------
-- 1. Pontuação, no servidor
-- ---------------------------------------------------------------------------
--
-- Dois defeitos independentes mantinham a pontuação sempre em zero:
--
--   a) `FormScoringPanel` grava o UUID do campo em `form_scoring_rules.field_id`,
--      mas as respostas são indexadas pelo NOME do campo (`register(field.name)`).
--      `calculateScore` fazia `answers[rule.field_id]` — sempre `undefined`.
--      Aqui o `field_id` é resolvido para `form_fields.name` por junção, o que
--      conserta sem precisar migrar dado nenhum.
--
--   b) `form_field_options.score` e `.tag` — a pontuação que o cliente digita ao
--      lado de cada opção no construtor, e que o banco guarda desde 09/2026 —
--      nunca eram lidos por ninguém.
--
-- E o `answer_contains` com valor vazio casava SEMPRE, porque em JavaScript
-- `''.includes('')` é `true`. Aqui o termo vazio não casa.
--
-- Rodar isto no servidor também fecha um furo de integridade: antes o score e a
-- temperatura chegavam ao `submitLead` como parâmetro calculado no navegador,
-- então quem preenchia podia editar a própria qualificação antes de enviar.

create or replace function public.pontuar_formulario(
  p_form_id uuid,
  p_answers jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_score int := 0;
  v_tags text[] := '{}';
  v_override text := null;
  v_temperatura text;
begin
  if p_form_id is null then
    return jsonb_build_object('score', 0, 'tags', '[]'::jsonb, 'temperature', 'cold');
  end if;

  -- Regras explícitas do painel de pontuação.
  select
    coalesce(sum(r.score_delta), 0),
    coalesce(array_agg(distinct r.tag_to_apply) filter (where r.tag_to_apply is not null), '{}'),
    -- Entre dois `temperature_override` que casam, vale o da regra mais recente:
    -- é a última coisa que o cliente configurou.
    (array_agg(r.temperature_override order by r.created_at desc)
       filter (where r.temperature_override is not null))[1]
  into v_score, v_tags, v_override
  from form_scoring_rules r
  join form_fields f on f.id = r.field_id
  cross join lateral (select p_answers ->> f.name as valor) a
  where r.form_id = p_form_id
    and coalesce(r.enabled, true)
    and case r.rule_type
      when 'answer_equals' then
        a.valor is not null and a.valor = (r.condition ->> 'value')
      when 'answer_contains' then
        -- Termo vazio não casa. Em JS `''.includes('')` dava `true` e a regra
        -- valia para todo mundo.
        a.valor is not null
        and coalesce(r.condition ->> 'value', '') <> ''
        and position(lower(r.condition ->> 'value') in lower(a.valor)) > 0
      when 'number_greater_than' then
        a.valor ~ '^-?[0-9]+(\.[0-9]+)?$'
        and (r.condition ->> 'value') ~ '^-?[0-9]+(\.[0-9]+)?$'
        and a.valor::numeric > (r.condition ->> 'value')::numeric
      when 'field_completed' then
        coalesce(btrim(a.valor), '') <> ''
      else false
    end;

  -- Pontuação por opção escolhida.
  --
  -- A comparação aceita `value` ou `label` porque o `<select>` do formulário
  -- renderiza a partir de `field.options` (jsonb), que guarda rótulo, enquanto
  -- `form_field_options` guarda os dois.
  select
    v_score + coalesce(sum(o.score), 0),
    v_tags || coalesce(array_agg(distinct o.tag) filter (where o.tag is not null), '{}')
  into v_score, v_tags
  from form_field_options o
  join form_fields f on f.id = o.field_id
  where o.form_id = p_form_id
    and (p_answers ->> f.name) is not null
    and (p_answers ->> f.name) in (o.value, o.label);

  -- Faixa de temperatura. `priority` desc é a ordem que o serviço já usava.
  if v_override is not null then
    v_temperatura := v_override;
  else
    select t.name into v_temperatura
    from form_temperature_rules t
    where t.form_id = p_form_id
      and v_score >= t.min_score
      and v_score <= t.max_score
    order by t.priority desc
    limit 1;
  end if;

  return jsonb_build_object(
    'score', v_score,
    'tags', to_jsonb(coalesce(v_tags, '{}'::text[])),
    'temperature', coalesce(v_temperatura, 'cold')
  );
end;
$$;

comment on function public.pontuar_formulario(uuid, jsonb) is
  'Pontua respostas no servidor. Resolve field_id -> form_fields.name e soma também form_field_options.score.';

-- ---------------------------------------------------------------------------
-- 2. Leitura pública do formulário
-- ---------------------------------------------------------------------------
--
-- Devolve só o necessário para renderizar. As regras de pontuação ficam de
-- fora de propósito: elas revelam a lógica de qualificação do cliente, e agora
-- quem pontua é o servidor.

create or replace function public.form_publico(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', f.id,
    'company_id', f.company_id,
    'name', f.name,
    'slug', f.slug,
    'description', f.description,
    'status', f.status,
    'type', f.type,
    'type_v2', f.type_v2,
    'settings', f.settings,
    'form_steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'form_id', s.form_id, 'title', s.title,
        'description', s.description, 'sort_order', s.sort_order,
        'button_text', s.button_text, 'conditional_logic', s.conditional_logic
      ) order by s.sort_order)
      from form_steps s where s.form_id = f.id
    ), '[]'::jsonb),
    'form_fields', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'form_id', c.form_id, 'label', c.label, 'name', c.name,
        'type', c.type, 'required', c.required, 'placeholder', c.placeholder,
        'options', c.options, 'validation_rules', c.validation_rules,
        'sort_order', c.sort_order, 'step_number', c.step_number,
        'step_id', c.step_id, 'logic_rules', c.logic_rules,
        'options_data', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', o.id, 'field_id', o.field_id, 'label', o.label,
            'value', o.value, 'sort_order', o.sort_order
            -- `score` e `tag` NÃO saem: é a régua de qualificação do cliente.
          ) order by o.sort_order)
          from form_field_options o where o.field_id = c.id
        ), '[]'::jsonb)
      ) order by c.step_number, c.sort_order)
      from form_fields c where c.form_id = f.id
    ), '[]'::jsonb)
  )
  from forms f
  where f.slug = p_slug
    and f.status = 'published'
  limit 1;
$$;

comment on function public.form_publico(text) is
  'Formulário publicado para renderização anônima. Sem regras de pontuação.';

-- ---------------------------------------------------------------------------
-- 3. Envio público
-- ---------------------------------------------------------------------------
--
-- Uma transação: lead + etiquetas + submissão + evento. Antes eram quatro
-- chamadas separadas do navegador, cada uma podendo falhar sozinha e deixar o
-- lead sem etiqueta, sem submissão ou sem histórico.
--
-- A trava de aconselhamento por (formulário, sessão) é o mesmo recurso que o
-- `quiz_capture_lead` usa: dois envios simultâneos da mesma sessão não viram
-- dois leads.

create or replace function public.form_submit_publico(
  p_slug text,
  p_session_id text,
  p_answers jsonb,
  p_tracking jsonb default '{}'::jsonb,
  p_event_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_form forms;
  v_stage_id uuid;
  v_lead_id uuid;
  v_submission_id uuid;
  v_pontuacao jsonb;
  v_score int;
  v_temperatura text;
  v_tags text[];
  v_nome text;
  v_email text;
  v_telefone text;
  v_existente uuid;
begin
  if coalesce(btrim(p_session_id), '') = '' then
    raise exception 'session_id obrigatório' using errcode = '22023';
  end if;

  select * into v_form from forms where slug = p_slug and status = 'published' limit 1;
  if v_form.id is null then
    return jsonb_build_object('ok', false, 'erro', 'formulario_nao_publicado');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_form.id::text || ':' || p_session_id, 0));

  -- Reenvio da mesma sessão não cria um segundo lead. A submissão também não é
  -- duplicada: o que o visitante corrigiu entra como atualização.
  select fs.lead_id, fs.id into v_existente, v_submission_id
  from form_submissions fs
  where fs.form_id = v_form.id
    and fs.tracking ->> 'session_id' = p_session_id
  order by fs.created_at desc
  limit 1;

  v_pontuacao := pontuar_formulario(v_form.id, coalesce(p_answers, '{}'::jsonb));
  v_score := (v_pontuacao ->> 'score')::int;
  v_temperatura := v_pontuacao ->> 'temperature';
  select coalesce(array_agg(t), '{}') into v_tags
  from jsonb_array_elements_text(v_pontuacao -> 'tags') t;

  -- Contato resolvido pelo TIPO do campo, não por um nome convencionado. Antes
  -- era `values.name || values.full_name`, que só funcionava se o cliente
  -- tivesse nomeado o campo exatamente assim.
  select
    max(case when f.type = 'email' then nullif(btrim(p_answers ->> f.name), '') end),
    max(case when f.type = 'phone' then nullif(btrim(p_answers ->> f.name), '') end),
    max(case when f.type = 'text'
                 and (lower(f.name) in ('name', 'nome', 'full_name', 'nome_completo')
                      or lower(f.label) like '%nome%')
             then nullif(btrim(p_answers ->> f.name), '') end)
  into v_email, v_telefone, v_nome
  from form_fields f
  where f.form_id = v_form.id;

  if v_existente is not null then
    v_lead_id := v_existente;
    update leads set
      name        = coalesce(nullif(btrim(v_nome), ''), name),
      email       = coalesce(nullif(btrim(v_email), ''), email),
      phone       = coalesce(nullif(btrim(v_telefone), ''), phone),
      score       = v_score,
      temperature = v_temperatura,
      -- O clique só aparece na primeira visita; `coalesce` impede que o
      -- reenvio apague a atribuição que já estava gravada.
      gclid       = coalesce(gclid, nullif(p_tracking ->> 'gclid', '')),
      wbraid      = coalesce(wbraid, nullif(p_tracking ->> 'wbraid', '')),
      gbraid      = coalesce(gbraid, nullif(p_tracking ->> 'gbraid', '')),
      fbclid      = coalesce(fbclid, nullif(p_tracking ->> 'fbclid', '')),
      event_id    = coalesce(event_id, nullif(p_event_id, '')),
      metadata    = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                      'form_id', v_form.id,
                      'form_slug', v_form.slug,
                      'session_id', p_session_id,
                      'answers', coalesce(p_answers, '{}'::jsonb),
                      'tags', to_jsonb(v_tags),
                      'source', 'public_form_v2'
                    ),
      updated_at  = now()
    where id = v_lead_id;
  else
    v_stage_id := resolve_entry_stage(
      v_form.company_id,
      nullif(v_form.settings ->> 'default_stage_id', '')::uuid
    );

    v_lead_id := gen_random_uuid();
    insert into leads (
      id, company_id, name, email, phone, source, status,
      stage_id, stage_entered_at, board_order, score, temperature,
      utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      gclid, wbraid, gbraid, fbclid, event_id, landing_page, referrer, metadata
    ) values (
      v_lead_id, v_form.company_id,
      nullif(btrim(v_nome), ''), nullif(btrim(v_email), ''), nullif(btrim(v_telefone), ''),
      'Alt Formulário', 'new',
      v_stage_id, now(), -extract(epoch from now()) * 1000,
      v_score, v_temperatura,
      nullif(p_tracking ->> 'utm_source', ''), nullif(p_tracking ->> 'utm_medium', ''),
      nullif(p_tracking ->> 'utm_campaign', ''), nullif(p_tracking ->> 'utm_content', ''),
      nullif(p_tracking ->> 'utm_term', ''),
      nullif(p_tracking ->> 'gclid', ''), nullif(p_tracking ->> 'wbraid', ''),
      nullif(p_tracking ->> 'gbraid', ''), nullif(p_tracking ->> 'fbclid', ''),
      nullif(p_event_id, ''),
      nullif(p_tracking ->> 'landing_page', ''), nullif(p_tracking ->> 'referrer', ''),
      jsonb_build_object(
        'form_id', v_form.id,
        'form_slug', v_form.slug,
        'session_id', p_session_id,
        'answers', coalesce(p_answers, '{}'::jsonb),
        'tags', to_jsonb(v_tags),
        'source', 'public_form_v2'
      )
    );
  end if;

  -- Etiquetas. `on conflict do nothing` precisa de chave única, que a tabela
  -- não tem — então apaga e regrava, que é correto porque a régua acabou de
  -- ser recalculada.
  delete from lead_tags where lead_id = v_lead_id;
  if array_length(v_tags, 1) > 0 then
    insert into lead_tags (lead_id, tag_name)
    select v_lead_id, t from unnest(v_tags) t;
  end if;

  if v_submission_id is null then
    v_submission_id := gen_random_uuid();
    insert into form_submissions (
      id, company_id, form_id, lead_id, answers, score, temperature, tags, tracking
    ) values (
      v_submission_id, v_form.company_id, v_form.id, v_lead_id,
      coalesce(p_answers, '{}'::jsonb), v_score, v_temperatura, v_tags,
      coalesce(p_tracking, '{}'::jsonb) || jsonb_build_object('session_id', p_session_id)
    );
  else
    update form_submissions set
      lead_id = v_lead_id,
      answers = coalesce(p_answers, '{}'::jsonb),
      score = v_score,
      temperature = v_temperatura,
      tags = v_tags,
      tracking = coalesce(p_tracking, '{}'::jsonb) || jsonb_build_object('session_id', p_session_id)
    where id = v_submission_id;
  end if;

  insert into lead_events (lead_id, event_type, description, metadata)
  values (
    v_lead_id, 'capture',
    format('Lead capturado pelo formulário %s — score %s (%s)', v_form.name, v_score, v_temperatura),
    jsonb_build_object('submission_id', v_submission_id, 'form_id', v_form.id)
  );

  -- O rascunho desta sessão deixa de ser abandono em aberto.
  update form_partial_submissions
  set status = 'completed', lead_id = v_lead_id, updated_at = now()
  where form_id = v_form.id and session_id = p_session_id;

  return jsonb_build_object(
    'ok', true,
    'lead_id', v_lead_id,
    'submission_id', v_submission_id,
    'score', v_score,
    'temperature', v_temperatura,
    'tags', to_jsonb(v_tags)
  );
end;
$$;

comment on function public.form_submit_publico(text, text, jsonb, jsonb, text) is
  'Envio público do formulário numa transação: lead + etiquetas + submissão + evento. Pontua no servidor.';

-- ---------------------------------------------------------------------------
-- 4. Rascunho (submissão parcial) por RPC
-- ---------------------------------------------------------------------------
--
-- O `session_id` continua sendo a credencial do rascunho — e desde 04/10 ele
-- vem de `crypto.randomUUID()`. A diferença é que agora a autorização não
-- depende de grant nenhum: a função só mexe na linha daquela sessão.
--
-- `score_preview` passa a ser real. Estava escrito `0` fixo no cliente, o que
-- tornava impossível distinguir "lead quente abandonou no passo 3" de
-- "alguém abriu e saiu".

create or replace function public.form_rascunho_salvar(
  p_slug text,
  p_session_id text,
  p_answers jsonb,
  p_step_index int default 0,
  p_tracking jsonb default '{}'::jsonb,
  p_visitor_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_form forms;
  v_pontuacao jsonb;
begin
  if coalesce(btrim(p_session_id), '') = '' then
    raise exception 'session_id obrigatório' using errcode = '22023';
  end if;

  select * into v_form from forms where slug = p_slug and status = 'published' limit 1;
  if v_form.id is null then
    return jsonb_build_object('ok', false, 'erro', 'formulario_nao_publicado');
  end if;

  v_pontuacao := pontuar_formulario(v_form.id, coalesce(p_answers, '{}'::jsonb));

  insert into form_partial_submissions (
    company_id, form_id, form_slug, session_id, visitor_id,
    current_step_index, answers, tracking,
    score_preview, temperature_preview, status, updated_at
  ) values (
    v_form.company_id, v_form.id, v_form.slug, p_session_id,
    nullif(btrim(p_visitor_id), ''),
    greatest(coalesce(p_step_index, 0), 0),
    coalesce(p_answers, '{}'::jsonb), coalesce(p_tracking, '{}'::jsonb),
    (v_pontuacao ->> 'score')::int, v_pontuacao ->> 'temperature',
    'in_progress', now()
  )
  on conflict (session_id, form_id) do update set
    visitor_id          = coalesce(excluded.visitor_id, form_partial_submissions.visitor_id),
    -- Nunca anda para trás: quem volta um passo não reduz a profundidade
    -- alcançada, que é o que mede o quão perto do fim a pessoa chegou.
    current_step_index  = greatest(form_partial_submissions.current_step_index, excluded.current_step_index),
    answers             = excluded.answers,
    tracking            = coalesce(form_partial_submissions.tracking, '{}'::jsonb) || excluded.tracking,
    score_preview       = excluded.score_preview,
    temperature_preview = excluded.temperature_preview,
    -- Um rascunho já concluído não volta a ficar em andamento.
    status              = case when form_partial_submissions.status = 'completed'
                               then 'completed' else 'in_progress' end,
    updated_at          = now();

  return jsonb_build_object(
    'ok', true,
    'score', (v_pontuacao ->> 'score')::int,
    'temperature', v_pontuacao ->> 'temperature'
  );
end;
$$;

create or replace function public.form_rascunho_ler(
  p_slug text,
  p_session_id text
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'current_step_index', p.current_step_index,
    'answers', p.answers,
    'status', p.status,
    'score_preview', p.score_preview,
    'temperature_preview', p.temperature_preview,
    'updated_at', p.updated_at
  )
  from form_partial_submissions p
  join forms f on f.id = p.form_id
  where f.slug = p_slug
    and f.status = 'published'
    and p.session_id = p_session_id
  limit 1;
$$;

comment on function public.form_rascunho_salvar(text, text, jsonb, int, jsonb, text) is
  'Grava o rascunho da sessão com score_preview real.';
comment on function public.form_rascunho_ler(text, text) is
  'Lê o rascunho de uma sessão. A sessão é a credencial; a função nunca devolve outra.';

-- ---------------------------------------------------------------------------
-- 5. Permissão
-- ---------------------------------------------------------------------------
--
-- Só EXECUTE nestas funções. Nenhum grant de tabela é concedido ao `anon`, que
-- continua com privilégio apenas em `leads` como já estava.

revoke all on function public.pontuar_formulario(uuid, jsonb) from public;
revoke all on function public.form_publico(text) from public;
revoke all on function public.form_submit_publico(text, text, jsonb, jsonb, text) from public;
revoke all on function public.form_rascunho_salvar(text, text, jsonb, int, jsonb, text) from public;
revoke all on function public.form_rascunho_ler(text, text) from public;

grant execute on function public.form_publico(text) to anon, authenticated;
grant execute on function public.form_submit_publico(text, text, jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.form_rascunho_salvar(text, text, jsonb, int, jsonb, text) to anon, authenticated;
grant execute on function public.form_rascunho_ler(text, text) to anon, authenticated;
-- `pontuar_formulario` não é pública: expõe a régua de qualificação. Só o
-- painel autenticado e as funções acima (que rodam como dono) a chamam.
grant execute on function public.pontuar_formulario(uuid, jsonb) to authenticated;
