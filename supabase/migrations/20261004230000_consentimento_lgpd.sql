-- Consentimento LGPD no formulário público
--
-- Medido em 04/10/2026:
--   * o formulário que o LEAD preenche não pedia consentimento nenhum;
--   * o componente `LGPDConsent` existia, mas só era usado pelo `CaptureForm`,
--     que é o formulário de DENTRO do painel — e estava em inglês, com as duas
--     caixas já marcadas. Caixa pré-marcada não é manifestação inequívoca, que
--     é o que o art. 8º da LGPD exige;
--   * `lgpdService.recordConsent` grava em `lgpd_consents`, tabela que NÃO
--     EXISTE no banco. E nenhum arquivo chama esse serviço.
--
-- O registro do consentimento é a prova. Sem ele, afirmar que a pessoa
-- consentiu é palavra contra palavra — por isso a gravação acontece na MESMA
-- transação do lead, e não numa chamada separada que pode falhar sozinha.

create table if not exists public.lead_consents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  form_id uuid references public.forms(id) on delete set null,
  session_id text,
  -- 'dados' é o tratamento necessário para atender o contato; 'marketing' é a
  -- comunicação promocional, que é finalidade distinta e exige opção própria.
  finalidade text not null check (finalidade in ('dados', 'marketing')),
  concedido boolean not null,
  -- O TEXTO que a pessoa viu, não um identificador dele. Se o cliente editar a
  -- redação depois, o registro antigo tem que continuar provando o que foi
  -- mostrado naquele dia.
  texto_exibido text,
  politica_url text,
  -- Observados pelo servidor, nunca informados pelo navegador.
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists lead_consents_lead_idx on public.lead_consents (lead_id);
create index if not exists lead_consents_company_idx on public.lead_consents (company_id, created_at desc);

alter table public.lead_consents enable row level security;

drop policy if exists "Consentimentos da empresa" on public.lead_consents;
create policy "Consentimentos da empresa" on public.lead_consents
  for select to authenticated using (check_membership(company_id));

-- Só leitura para quem opera. Quem grava é a função de envio, que roda como
-- dono: um registro de consentimento editável depois não prova nada.
grant select on public.lead_consents to authenticated;

comment on table public.lead_consents is
  'Prova do consentimento: o texto exibido, a finalidade, o IP e o momento.';

-- ---------------------------------------------------------------------------
-- O envio passa a exigir e registrar o consentimento
-- ---------------------------------------------------------------------------
--
-- A exigência é verificada AQUI, no servidor. Deixar só a caixa desabilitando
-- o botão não vale: qualquer um envia direto para a API sem passar pela tela, e
-- aí o lead entraria sem consentimento com o cliente achando que tem prova.

create or replace function public.form_submit_publico(
  p_slug text,
  p_session_id text,
  p_answers jsonb,
  p_tracking jsonb default '{}'::jsonb,
  p_event_id text default null,
  -- { "dados": true, "marketing": false }
  p_consents jsonb default '{}'::jsonb
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
  v_exige boolean;
  v_texto text;
  v_politica text;
  v_ip inet;
  v_ua text;
  v_cab json;
begin
  if coalesce(btrim(p_session_id), '') = '' then
    raise exception 'session_id obrigatório' using errcode = '22023';
  end if;

  select * into v_form from forms
   where status = 'published'
     and (slug = p_slug or id::text = lower(btrim(p_slug)))
   limit 1;
  if v_form.id is null then
    return jsonb_build_object('ok', false, 'erro', 'formulario_nao_publicado');
  end if;

  v_exige := coalesce((v_form.settings ->> 'lgpd_exigir_consentimento')::boolean, false);
  v_texto := nullif(v_form.settings ->> 'lgpd_texto', '');
  v_politica := nullif(v_form.settings ->> 'lgpd_politica_url', '');

  if v_exige and not coalesce((p_consents ->> 'dados')::boolean, false) then
    return jsonb_build_object('ok', false, 'erro', 'consentimento_obrigatorio');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_form.id::text || ':' || p_session_id, 0));

  select fs.lead_id, fs.id into v_existente, v_submission_id
  from form_submissions fs
  where fs.form_id = v_form.id and fs.tracking ->> 'session_id' = p_session_id
  order by fs.created_at desc limit 1;

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
  from form_fields f where f.form_id = v_form.id;

  if v_existente is not null then
    v_lead_id := v_existente;
    update leads set
      name = coalesce(nullif(btrim(v_nome), ''), name),
      email = coalesce(nullif(btrim(v_email), ''), email),
      phone = coalesce(nullif(btrim(v_telefone), ''), phone),
      score = v_score, temperature = v_temperatura,
      gclid = coalesce(gclid, nullif(p_tracking ->> 'gclid', '')),
      wbraid = coalesce(wbraid, nullif(p_tracking ->> 'wbraid', '')),
      gbraid = coalesce(gbraid, nullif(p_tracking ->> 'gbraid', '')),
      fbclid = coalesce(fbclid, nullif(p_tracking ->> 'fbclid', '')),
      event_id = coalesce(event_id, nullif(p_event_id, '')),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                   'form_id', v_form.id, 'form_slug', v_form.slug,
                   'session_id', p_session_id,
                   'answers', coalesce(p_answers, '{}'::jsonb),
                   'tags', to_jsonb(v_tags), 'source', 'public_form_v2'),
      updated_at = now()
    where id = v_lead_id;
  else
    v_stage_id := resolve_entry_stage(
      v_form.company_id, nullif(v_form.settings ->> 'default_stage_id', '')::uuid);
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
        'form_id', v_form.id, 'form_slug', v_form.slug, 'session_id', p_session_id,
        'answers', coalesce(p_answers, '{}'::jsonb),
        'tags', to_jsonb(v_tags), 'source', 'public_form_v2')
    );
  end if;

  -- Consentimento: IP e navegador saem dos CABEÇALHOS, não do corpo. O que o
  -- navegador afirma sobre si mesmo não serve como prova.
  begin
    v_cab := nullif(current_setting('request.headers', true), '')::json;
    -- `x-forwarded-for` pode vir com vários saltos; o primeiro é o cliente.
    v_ip := nullif(split_part(coalesce(v_cab ->> 'x-forwarded-for', ''), ',', 1), '')::inet;
    v_ua := v_cab ->> 'user-agent';
  exception when others then
    v_ip := null; v_ua := null;
  end;

  if p_consents ? 'dados' or p_consents ? 'marketing' then
    delete from lead_consents
     where lead_id = v_lead_id and form_id = v_form.id and session_id = p_session_id;

    insert into lead_consents (
      company_id, lead_id, form_id, session_id, finalidade, concedido,
      texto_exibido, politica_url, ip, user_agent
    )
    select v_form.company_id, v_lead_id, v_form.id, p_session_id,
           f, coalesce((p_consents ->> f)::boolean, false),
           v_texto, v_politica, v_ip, v_ua
      from (select unnest(array['dados','marketing']) as f) k
     where p_consents ? k.f;
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
    values (v_lead_id, 'capture',
      format('Lead capturado pelo formulário %s — score %s (%s)', v_form.name, v_score, v_temperatura),
      jsonb_build_object('submission_id', v_submission_id, 'form_id', v_form.id));
  end if;

  update form_partial_submissions
  set status = 'completed', lead_id = v_lead_id, updated_at = now()
  where form_id = v_form.id and session_id = p_session_id;

  return jsonb_build_object(
    'ok', true, 'lead_id', v_lead_id, 'submission_id', v_submission_id,
    'score', v_score, 'temperature', v_temperatura, 'tags', to_jsonb(v_tags));
end;
$$;

-- A assinatura mudou (ganhou `p_consents`), então a versão de 5 argumentos
-- some para não ficar uma sobrecarga antiga aceitando envio sem consentimento.
drop function if exists public.form_submit_publico(text, text, jsonb, jsonb, text);

revoke all on function public.form_submit_publico(text, text, jsonb, jsonb, text, jsonb) from public;
grant execute on function public.form_submit_publico(text, text, jsonb, jsonb, text, jsonb) to anon, authenticated;
