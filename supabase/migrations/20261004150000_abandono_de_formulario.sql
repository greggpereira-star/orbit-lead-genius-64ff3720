-- Abandono de formulário: o recurso que já estava 80% construído
--
-- A tabela `form_partial_submissions` existe desde 15/07/2026, com chave única
-- `(session_id, form_id)`, respostas, tracking, `score_preview`,
-- `temperature_preview` e um `status` cujo comentário na migração original diz
-- `started | completed | abandoned`.
--
-- Medido em 04/10/2026: NADA no código nem no `pg_cron` escreve `abandoned` ou
-- `expired`. Os três jobs ativos são `meta-retry-failed-jobs`,
-- `whatsapp_capi_retry_5min` e `despacho-conversao`. O rascunho era gravado e
-- ficava `in_progress` para sempre. E o `score_preview` vinha `0` fixo do
-- cliente, o que tornava impossível distinguir "lead quente abandonou no passo
-- 3" de "alguém abriu a página e saiu".
--
-- A migração 20261004140000 já resolveu o `score_preview`. Esta fecha o ciclo:
-- marca o abandono e torna a fila consultável.

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
begin
  -- Abandono: parou de digitar e não voltou. 30 minutos é o padrão porque é
  -- longo o bastante para não pegar quem foi tomar um café, e curto o bastante
  -- para a recuperação ainda ser oportuna.
  update form_partial_submissions
  set status = 'abandoned', updated_at = now()
  where status in ('started', 'in_progress')
    and updated_at < now() - make_interval(mins => greatest(p_minutos, 1));
  get diagnostics v_abandonados = row_count;

  -- Expiração: `expires_at` já tinha `now() + 30 dias` como padrão e ninguém
  -- nunca olhou para ele. Depois disso o rascunho deixa de ser recuperável —
  -- e deixa de pesar na fila de quem for trabalhar os abandonos.
  update form_partial_submissions
  set status = 'expired', updated_at = now()
  where status <> 'completed'
    and status <> 'expired'
    and expires_at is not null
    and expires_at < now();
  get diagnostics v_expirados = row_count;

  return jsonb_build_object('abandonados', v_abandonados, 'expirados', v_expirados);
end;
$$;

comment on function public.marcar_rascunhos_abandonados(int) is
  'Marca rascunhos parados como abandonados e os vencidos como expirados. Chamada pelo pg_cron.';

revoke all on function public.marcar_rascunhos_abandonados(int) from public;
grant execute on function public.marcar_rascunhos_abandonados(int) to authenticated;

-- ---------------------------------------------------------------------------
-- A fila de recuperação
-- ---------------------------------------------------------------------------
--
-- Ordenada pelo que importa para quem vai trabalhar a lista: score primeiro,
-- profundidade depois. Quem chegou ao passo 4 com score alto e não enviou é
-- mais valioso que quem abandonou no passo 1 — e hoje os dois eram linhas
-- idênticas na tabela.

create or replace function public.rascunhos_abandonados(
  p_company_id uuid,
  p_desde_dias int default 30
)
returns table (
  id uuid,
  form_id uuid,
  form_slug text,
  form_name text,
  session_id text,
  passo int,
  total_passos int,
  score int,
  temperatura text,
  nome text,
  email text,
  telefone text,
  utm_source text,
  utm_campaign text,
  abandonado_em timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    p.id,
    p.form_id,
    p.form_slug,
    f.name,
    p.session_id,
    coalesce(p.current_step_index, 0) + 1,
    greatest((select count(distinct c.step_number)::int from form_fields c where c.form_id = p.form_id), 1),
    coalesce(p.score_preview, 0),
    coalesce(p.temperature_preview, 'cold'),
    -- O contato que a pessoa já tinha digitado antes de desistir. É isso que
    -- faz o abandono ser recuperável: sem telefone ou e-mail não há como voltar.
    (select nullif(btrim(p.answers ->> c.name), '') from form_fields c
      where c.form_id = p.form_id and c.type = 'text'
        and (lower(c.name) in ('name','nome','full_name','nome_completo') or lower(c.label) like '%nome%')
      order by c.sort_order limit 1),
    (select nullif(btrim(p.answers ->> c.name), '') from form_fields c
      where c.form_id = p.form_id and c.type = 'email' order by c.sort_order limit 1),
    (select nullif(btrim(p.answers ->> c.name), '') from form_fields c
      where c.form_id = p.form_id and c.type = 'phone' order by c.sort_order limit 1),
    nullif(p.tracking ->> 'utm_source', ''),
    nullif(p.tracking ->> 'utm_campaign', ''),
    p.updated_at
  from form_partial_submissions p
  join forms f on f.id = p.form_id
  where p.company_id = p_company_id
    and check_membership(p.company_id)
    and p.status = 'abandoned'
    and p.updated_at > now() - make_interval(days => greatest(p_desde_dias, 1))
  order by coalesce(p.score_preview, 0) desc, coalesce(p.current_step_index, 0) desc, p.updated_at desc;
$$;

comment on function public.rascunhos_abandonados(uuid, int) is
  'Fila de recuperação de formulário abandonado, ordenada por score e profundidade.';

revoke all on function public.rascunhos_abandonados(uuid, int) from public;
grant execute on function public.rascunhos_abandonados(uuid, int) to authenticated;

-- Índice para a varredura do cron e para a fila.
create index if not exists form_partial_submissions_status_updated_idx
  on public.form_partial_submissions (status, updated_at desc);
create index if not exists form_partial_submissions_company_status_idx
  on public.form_partial_submissions (company_id, status, score_preview desc);

-- ---------------------------------------------------------------------------
-- O job
-- ---------------------------------------------------------------------------
--
-- Roda no banco, sem rota HTTP. Diferente dos outros três jobs, aqui não há
-- nenhuma API externa para chamar — é só um UPDATE —, então a volta pelo
-- `net.http_post` e por um `CRON_SECRET` só adicionaria coisa para falhar.

select cron.schedule(
  'marcar-rascunhos-abandonados',
  '*/10 * * * *',
  $cron$ select public.marcar_rascunhos_abandonados(30); $cron$
);
