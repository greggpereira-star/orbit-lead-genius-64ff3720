-- O formulário público por ID continuava quebrado
--
-- A migração 20261004140000 tirou a leitura pública da tabela e colocou em
-- `form_publico(slug)`. Mas eu só troquei o caminho do SLUG. Todo o caminho do
-- ID continuou lendo `forms` direto, e o papel `anon` não tem grant nessa
-- tabela — o mesmo `permission denied` de antes.
--
-- E o caminho do ID é justamente o que a tela de publicação entrega ao cliente:
--
--   `FormPublish` monta todos os trechos com `formId: "<uuid>"`;
--   `sdk.js:72` manda UUID para `/embed-form/<id>`;
--   `embed-form.$id.tsx` chama `formService.getFormById` → tabela direta;
--   `PublicFormRenderer` cai em `getFormById` quando o slug parece UUID.
--
-- Ou seja: o único caminho que funcionava depois da correção de hoje era o
-- link direto `/f/<slug>`. Inline, iframe, popup e o shortcode do WordPress —
-- tudo o que a tela apresenta como a forma de integrar — continuavam mortos.
--
-- `form_publico` passa a aceitar slug OU id. Uma função só, um grant só: duas
-- funções quase iguais divergiriam na primeira mudança de campo.

drop function if exists public.form_publico(text);

create or replace function public.form_publico(p_chave text)
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
  where f.status = 'published'
    and (
      f.slug = p_chave
      -- O `~` guarda o cast: `'nao-uuid'::uuid` levantaria 22P02 e derrubaria
      -- a consulta inteira, inclusive para quem passou um slug válido.
      or (p_chave ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and f.id = p_chave::uuid)
    )
  limit 1;
$$;

comment on function public.form_publico(text) is
  'Formulário publicado para renderização anônima, por slug OU id. Sem regras de pontuação.';

revoke all on function public.form_publico(text) from public;
grant execute on function public.form_publico(text) to anon, authenticated;

-- O envio também: `form_submit_publico` só aceitava slug, e o embed por id
-- passa o que tiver em mãos.
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

  -- Slug OU id, pelo mesmo motivo do `form_publico`.
  select * into v_form from forms
   where status = 'published'
     and (slug = p_slug
          or (p_slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              and id = p_slug::uuid))
   limit 1;
  if v_form.id is null then
    return jsonb_build_object('ok', false, 'erro', 'formulario_nao_publicado');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_form.id::text || ':' || p_session_id, 0));

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
      gclid       = coalesce(gclid, nullif(p_tracking ->> 'gclid', '')),
      wbraid      = coalesce(wbraid, nullif(p_tracking ->> 'wbraid', '')),
      gbraid      = coalesce(gbraid, nullif(p_tracking ->> 'gbraid', '')),
      fbclid      = coalesce(fbclid, nullif(p_tracking ->> 'fbclid', '')),
      event_id    = coalesce(event_id, nullif(p_event_id, '')),
      metadata    = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                      'form_id', v_form.id, 'form_slug', v_form.slug,
                      'session_id', p_session_id,
                      'answers', coalesce(p_answers, '{}'::jsonb),
                      'tags', to_jsonb(v_tags), 'source', 'public_form_v2'
                    ),
      updated_at  = now()
    where id = v_lead_id;
  else
    v_stage_id := resolve_entry_stage(
      v_form.company_id, nullif(v_form.settings ->> 'default_stage_id', '')::uuid
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
        'form_id', v_form.id, 'form_slug', v_form.slug,
        'session_id', p_session_id,
        'answers', coalesce(p_answers, '{}'::jsonb),
        'tags', to_jsonb(v_tags), 'source', 'public_form_v2'
      )
    );
  end if;

  delete from lead_tags where lead_id = v_lead_id;
  if array_length(v_tags, 1) > 0 then
    insert into lead_tags (lead_id, company_id, tag_name)
    select v_lead_id, v_form.company_id, t from unnest(v_tags) t;
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
      lead_id = v_lead_id, answers = coalesce(p_answers, '{}'::jsonb),
      score = v_score, temperature = v_temperatura, tags = v_tags,
      tracking = coalesce(p_tracking, '{}'::jsonb) || jsonb_build_object('session_id', p_session_id)
    where id = v_submission_id;
  end if;

  if v_existente is null then
    insert into lead_events (lead_id, event_type, description, metadata)
    values (
      v_lead_id, 'capture',
      format('Lead capturado pelo formulário %s — score %s (%s)', v_form.name, v_score, v_temperatura),
      jsonb_build_object('submission_id', v_submission_id, 'form_id', v_form.id)
    );
  end if;

  update form_partial_submissions
  set status = 'completed', lead_id = v_lead_id, updated_at = now()
  where form_id = v_form.id and session_id = p_session_id;

  return jsonb_build_object(
    'ok', true, 'lead_id', v_lead_id, 'submission_id', v_submission_id,
    'score', v_score, 'temperature', v_temperatura, 'tags', to_jsonb(v_tags)
  );
end;
$$;

-- O rascunho também.
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
    'answers', p.answers, 'status', p.status,
    'score_preview', p.score_preview,
    'temperature_preview', p.temperature_preview,
    'updated_at', p.updated_at
  )
  from form_partial_submissions p
  join forms f on f.id = p.form_id
  where f.status = 'published'
    and (f.slug = p_slug
         or (p_slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and f.id = p_slug::uuid))
    and p.session_id = p_session_id
  limit 1;
$$;

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

  select * into v_form from forms
   where status = 'published'
     and (slug = p_slug
          or (p_slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              and id = p_slug::uuid))
   limit 1;
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
    current_step_index  = greatest(form_partial_submissions.current_step_index, excluded.current_step_index),
    answers             = excluded.answers,
    tracking            = coalesce(form_partial_submissions.tracking, '{}'::jsonb) || excluded.tracking,
    score_preview       = excluded.score_preview,
    temperature_preview = excluded.temperature_preview,
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
