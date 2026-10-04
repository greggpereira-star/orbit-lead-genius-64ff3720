-- Números reais no lugar dos inventados
--
-- Medido em 04/10/2026, no código:
--
--   FormEventsPanel       "1.284 eventos", "842 inícios", "156 submissões",
--                         "18.5%" e cinco linhas de atividade escritas no
--                         componente. Nada vinha do banco.
--   FormSubmissionsPanel  "João Silva", "Maria Oliveira", "Pedro Santos", com
--                         telefones e datas inventados. Os botões CSV e PDF
--                         emitiam `toast.info` e, 2s depois,
--                         `toast.success('Exportação concluída')` — sem gerar
--                         arquivo nenhum.
--   FormList              `0` leads e `0%` de conversão LITERAIS no JSX, com um
--                         `+0%` em verde ao lado.
--
-- Dado inventado numa tela de produto é pior que tela vazia: o cliente lê como
-- se fosse o número dele e decide em cima disso.
--
-- E um achado ao ligar: `form_partial_submissions` tem RLS ligada e só
-- políticas para `anon`. O operador logado não conseguia ler os rascunhos —
-- então qualquer tela de abandono mostraria vazio mesmo com dado lá dentro.
-- Resolvido pela função abaixo, que roda como dono e confere a associação.

-- ---------------------------------------------------------------------------
-- 1. Números por formulário
-- ---------------------------------------------------------------------------

create or replace function public.metricas_dos_formularios(p_company_id uuid)
returns table (
  form_id uuid,
  enviados bigint,
  iniciados bigint,
  abandonados bigint,
  -- Enviados sobre quem começou a preencher. Sem contador de visualização no
  -- produto, "conversão" sobre visitas seria um número que não temos.
  taxa_de_conclusao numeric,
  ultimo_envio timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    f.id,
    coalesce(s.enviados, 0),
    coalesce(p.iniciados, 0),
    coalesce(p.abandonados, 0),
    case
      when coalesce(p.iniciados, 0) + coalesce(s.enviados, 0) = 0 then 0
      -- Quem enviou também começou; um rascunho concluído deixa de contar como
      -- iniciado em aberto, então a base é a soma.
      else round(100.0 * coalesce(s.enviados, 0)
                 / nullif(coalesce(p.iniciados, 0) + coalesce(s.enviados, 0), 0), 1)
    end,
    s.ultimo
  from forms f
  left join (
    select form_id, count(*) as enviados, max(created_at) as ultimo
      from form_submissions group by form_id
  ) s on s.form_id = f.id
  left join (
    select form_id,
           count(*) filter (where status <> 'completed') as iniciados,
           count(*) filter (where status = 'abandoned') as abandonados
      from form_partial_submissions group by form_id
  ) p on p.form_id = f.id
  where f.company_id = p_company_id
    and check_membership(p_company_id);
$$;

-- ---------------------------------------------------------------------------
-- 2. Submissões de um formulário
-- ---------------------------------------------------------------------------

create or replace function public.submissoes_do_formulario(
  p_form_id uuid,
  p_busca text default null,
  p_limite int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  lead_id uuid,
  nome text,
  email text,
  telefone text,
  score int,
  temperatura text,
  etiquetas text[],
  respostas jsonb,
  utm_source text,
  utm_campaign text,
  criado_em timestamptz,
  total bigint
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with permitido as (
    select f.id, f.company_id from forms f
     where f.id = p_form_id and check_membership(f.company_id)
  ),
  filtrado as (
    select s.*, l.name as lead_nome, l.email as lead_email, l.phone as lead_phone,
           l.utm_source as l_utm_source, l.utm_campaign as l_utm_campaign
      from form_submissions s
      join permitido pm on pm.id = s.form_id
      left join leads l on l.id = s.lead_id
     where coalesce(btrim(p_busca), '') = ''
        or l.name ilike '%' || btrim(p_busca) || '%'
        or l.email ilike '%' || btrim(p_busca) || '%'
        or l.phone ilike '%' || btrim(p_busca) || '%'
  )
  select id, lead_id, lead_nome, lead_email, lead_phone,
         score, temperature, tags, answers,
         l_utm_source, l_utm_campaign, created_at,
         count(*) over () as total
    from filtrado
   order by created_at desc
   limit greatest(coalesce(p_limite, 50), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- 3. Atividade recente
-- ---------------------------------------------------------------------------
--
-- Substitui os cinco "eventos" inventados. O produto não tem registro de
-- `field_focused` nem `form_viewed` — inventar essas linhas seria repetir o
-- problema. O que existe de verdade: quem começou a preencher, quem
-- abandonou e quem enviou.

create or replace function public.atividade_do_formulario(
  p_form_id uuid,
  p_limite int default 25
)
returns table (
  tipo text,
  quando timestamptz,
  passo int,
  score int,
  temperatura text,
  identificacao text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with permitido as (
    select f.id from forms f where f.id = p_form_id and check_membership(f.company_id)
  )
  -- Os apelidos precisam estar na subconsulta: `order by quando` não enxerga
  -- os nomes da assinatura da função.
  select t.tipo, t.quando, t.passo, t.score, t.temperatura, t.identificacao from (
    select 'enviado'::text as tipo, s.created_at as quando, null::int as passo,
           s.score as score, s.temperature as temperatura,
           coalesce(l.name, l.email, l.phone, 'sem identificação') as identificacao
      from form_submissions s
      join permitido pm on pm.id = s.form_id
      left join leads l on l.id = s.lead_id
    union all
    select case when p.status = 'abandoned' then 'abandonado' else 'preenchendo' end,
           p.updated_at, coalesce(p.current_step_index, 0) + 1,
           p.score_preview, p.temperature_preview,
           'sessão ' || left(p.session_id, 8)
      from form_partial_submissions p
      join permitido pm on pm.id = p.form_id
     where p.status <> 'completed'
  ) t
  order by t.quando desc
  limit greatest(coalesce(p_limite, 25), 1);
$$;

revoke all on function public.metricas_dos_formularios(uuid) from public;
revoke all on function public.submissoes_do_formulario(uuid, text, int, int) from public;
revoke all on function public.atividade_do_formulario(uuid, int) from public;
grant execute on function public.metricas_dos_formularios(uuid) to authenticated;
grant execute on function public.submissoes_do_formulario(uuid, text, int, int) to authenticated;
grant execute on function public.atividade_do_formulario(uuid, int) to authenticated;
