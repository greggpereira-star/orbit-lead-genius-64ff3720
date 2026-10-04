-- O gatilho de histórico de etapas quebrava TODO insert de lead
--
-- Defeito meu, introduzido em 20261003130000 e carregado adiante por
-- 20261003150000. `registrar_movimento_de_etapa()` declara `v_de record` e
-- `v_para record` e só executa o `select ... into` deles sob condição:
--
--   if (tg_op = 'UPDATE' and old.stage_id is not null) then ... into v_de
--   if new.stage_id is not null then                   ... into v_para
--
-- Mas o INSERT no histórico referencia `v_de.name`, `v_de.order_index`,
-- `v_de.kind`, `v_para.name`, ... sem condição nenhuma. Em PL/pgSQL um
-- `record` que nunca recebeu atribuição não tem estrutura, e ler um campo dele
-- levanta:
--
--   ERROR:  record "v_de" is not assigned yet
--
-- Um `select into` que não acha linha ATRIBUI o record com tudo nulo — por isso
-- o caso normal, mover o card de uma etapa para outra, sempre funcionou: ali
-- `old.stage_id` não é nulo e o `select` roda. As 5 linhas em
-- `lead_stage_history` são todas desse caso, e todas têm origem preenchida.
--
-- O que nunca rodou foi o INSERT. O gatilho é `AFTER INSERT OR UPDATE OF
-- stage_id`, então desde 03/10 QUALQUER criação de lead falha — com etapa ou
-- sem etapa, conferido nos dois casos. Isso atinge o quiz
-- (`quiz_capture_lead`), o chat, a captura por WhatsApp e o painel. Passou
-- despercebido porque nenhum lead entrou desde então: o mais recente dos 489 é
-- de 2026-10-03 08:35, horas antes do gatilho existir.
--
-- Encontrado em 04/10/2026 ao testar `form_submit_publico`, que foi o primeiro
-- INSERT de lead a rodar desde a instalação do gatilho.

create or replace function public.registrar_movimento_de_etapa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Escalares, e não `record`. Um escalar nasce nulo e nulo é exatamente o que
  -- o histórico deve guardar quando não há etapa de origem. Com `record` a
  -- ausência de atribuição é um estado sem estrutura, que não se pode ler — e
  -- era por isso que o INSERT quebrava.
  v_de_nome text;
  v_de_ordem int;
  v_de_tipo text;
  v_para_nome text;
  v_para_ordem int;
  v_para_tipo text;
  v_origem text;
  v_motivo text;
begin
  if (tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id) then
    return new;
  end if;

  if (tg_op = 'UPDATE' and old.stage_id is not null) then
    select s.name, s.order_index, s.kind
      into v_de_nome, v_de_ordem, v_de_tipo
      from public.stages s where s.id = old.stage_id;
  end if;

  if new.stage_id is not null then
    select s.name, s.order_index, s.kind
      into v_para_nome, v_para_ordem, v_para_tipo
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
    case when tg_op = 'UPDATE' then old.stage_id end, v_de_nome, v_de_ordem, v_de_tipo,
    new.stage_id, v_para_nome, v_para_ordem, v_para_tipo,
    auth.uid(), v_origem, v_motivo
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- E um ajuste em `form_submit_publico`, achado no mesmo teste
-- ---------------------------------------------------------------------------
--
-- O reenvio da mesma sessão atualizava o lead e a submissão (correto) mas
-- inseria um SEGUNDO evento 'capture' no histórico — a ficha passava a dizer
-- que a pessoa foi capturada duas vezes. Medido: dois envios da sessão
-- `sessao-de-teste-aaaa` deixavam 1 lead, 1 submissão e 2 eventos.
--
-- A migração 20261004140000 fica como foi aplicada; a correção vem aqui.

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

  -- Só na criação. O reenvio da mesma sessão atualiza o lead e a submissão; um
  -- segundo evento 'capture' faria a ficha dizer que a pessoa foi capturada
  -- duas vezes.
  if v_existente is null then
    insert into lead_events (lead_id, event_type, description, metadata)
    values (
      v_lead_id, 'capture',
      format('Lead capturado pelo formulário %s — score %s (%s)', v_form.name, v_score, v_temperatura),
      jsonb_build_object('submission_id', v_submission_id, 'form_id', v_form.id)
    );
  end if;

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
