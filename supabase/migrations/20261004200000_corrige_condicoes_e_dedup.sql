-- Dois defeitos do motor, achados no próprio teste de aceite
--
-- ---------------------------------------------------------------------------
-- 1. Condição sobre campo ausente PASSAVA
-- ---------------------------------------------------------------------------
--
-- Medido: uma regra com `utm_source igual "facebook"` disparou para um lead que
-- não tinha `utm_source` nenhum.
--
-- A causa é a semântica de três valores do SQL combinada com `bool_and`.
-- `(null) = 'facebook'` não é falso, é NULL. `bool_and` IGNORA nulos, e de um
-- conjunto só de nulos devolve NULL. O `coalesce(bool_and(...), true)` — que
-- existia para fazer "sem condição nenhuma" passar — então transformava
-- "nenhuma condição pôde ser avaliada" em "todas passaram".
--
-- O efeito prático era o pior possível: a regra agia sobre leads que ela
-- deveria ter filtrado. Agora cada condição é fechada em `coalesce(..., false)`
-- individualmente — campo ausente reprova — e o `true` externo passa a
-- significar só o que sempre deveria: a lista está vazia.

create or replace function public.automacao_condicoes_passam(
  p_conditions jsonb,
  p_payload jsonb
)
returns boolean
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(bool_and(coalesce(
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
      -- Operador desconhecido não passa: o contrário faria uma regra mal
      -- configurada agir sobre todos os leads.
      else false
    end,
    -- Campo ausente, valor não numérico, qualquer comparação que devolva NULL:
    -- reprova. Uma condição que não pôde ser avaliada não foi satisfeita.
    false
  )), true)
  from jsonb_array_elements(coalesce(p_conditions, '[]'::jsonb)) c;
$$;

-- ---------------------------------------------------------------------------
-- 2. Voltar à mesma etapa era engolido para sempre
-- ---------------------------------------------------------------------------
--
-- Medido: lead move para "Proposta enviada" (1 job), vai para "Qualificado"
-- (nenhum job, condição não bate), volta para "Proposta enviada" — e o segundo
-- job era descartado, porque a chave de dedup era
-- `regra:lead:etapa:<etapa_destino>`, idêntica à da primeira passagem.
--
-- O comentário que eu escrevi na migração anterior afirmava justamente o
-- contrário ("mover e voltar são dois eventos legítimos"). A chave não fazia
-- isso: ela deduplicava a ETAPA, não a TRANSIÇÃO.
--
-- A chave passa a incluir o id da transação. Duas inserções na mesma transação
-- continuam sendo uma só — que é a repetição real contra a qual o dedup
-- protege —, e uma volta à mesma etapa depois é um evento novo, como deve ser.

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
      -- Criação é única por lead: a chave não precisa de mais nada, e assim um
      -- reprocessamento jamais duplica a automação de entrada.
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
        'etapa:' || coalesce(new.stage_id::text, 'nenhuma') || ':tx' || txid_current()::text
      );
    end if;
  exception when others then
    -- O gatilho de histórico de etapa derrubou TODO insert de lead por 24h em
    -- 03/10 por não ter esta proteção. Automação é acessório; perder o lead não.
    raise warning 'enfileirar automação falhou para o lead %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
