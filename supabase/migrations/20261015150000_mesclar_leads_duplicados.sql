-- Mesclagem dos leads que JÁ são duplicata.
--
-- A migração 20261013120000 impede duplicata NOVA; esta junta as que já existem
-- (medido em 13/10/2026: 560 leads, 28 linhas excedentes, 27 grupos).
-- O widget de WhatsApp também gerava duplicatas por clique (corrigido no código
-- em b77875f); elas entram aqui pelo mesmo critério.
--
-- NÃO FOI EXECUTADA contra banco nenhum. Ensaie com
-- `scripts/ensaio-mesclagem/rodar.sh` antes.
--
-- Cautelas, porque juntar duas pessoas diferentes não tem desfazer:
--   * Critério idêntico ao da captura: mesma empresa E (mesmo e-mail, sem
--     diferença de caixa/espaço, OU mesmo telefone normalizado). Telefone que
--     não normaliza (NULL) não casa com nada.
--   * Ganha o lead MAIS ANTIGO: é o que pode ter responsável, etapa e histórico.
--   * Nada é apagado sem cópia: cada lead absorvido vai inteiro, em jsonb, para
--     `leads_mesclados`, com o id do vencedor. Dá para reconstituir.
--   * Toda tabela que aponta para `leads` é descoberta no catálogo (pg_constraint),
--     não listada à mão — uma tabela esquecida ficaria órfã ou travaria o DELETE.
--   * Roda em modo RELATÓRIO por padrão (`p_aplicar = false`): só lista o plano.

CREATE TABLE IF NOT EXISTS public.leads_mesclados (
  lead_id      uuid PRIMARY KEY,
  vencedor_id  uuid NOT NULL,
  linha        jsonb NOT NULL,
  mesclado_em  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.leads_mesclados ENABLE ROW LEVEL SECURITY;
-- Sem política: só a chave de serviço e o dono do banco enxergam.

CREATE OR REPLACE FUNCTION public.mesclar_leads_duplicados(p_aplicar boolean DEFAULT false)
RETURNS TABLE (vencedor_id uuid, absorvido_id uuid, motivo text, aplicado boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  fk record;
  linha record;
  v_json jsonb;
BEGIN
  -- Pares (vencedor, absorvido). Um lead pode casar com vários; fica com o
  -- vencedor MAIS ANTIGO entre os que casam, e só é absorvido uma vez.
  DROP TABLE IF EXISTS _pares;
  CREATE TEMP TABLE _pares ON COMMIT DROP AS
  WITH base AS (
    SELECT id, company_id, created_at,
           nullif(lower(btrim(email)), '') AS em,
           public.normalizar_telefone_br(phone) AS fone
      FROM public.leads
  ),
  casam AS (
    SELECT a.id AS p_venc, b.id AS p_abs,
           CASE WHEN a.em IS NOT NULL AND a.em = b.em THEN 'email' ELSE 'telefone' END AS p_motivo
      FROM base a
      JOIN base b
        ON a.company_id = b.company_id
       AND a.id <> b.id
       AND (a.created_at, a.id) < (b.created_at, b.id)
       AND ((a.em IS NOT NULL AND a.em = b.em)
         OR (a.fone IS NOT NULL AND a.fone = b.fone))
  )
  SELECT DISTINCT ON (p_abs) p_venc, p_abs, p_motivo
    FROM casam
   ORDER BY p_abs,
            (SELECT created_at FROM public.leads WHERE id = casam.p_venc), p_venc;

  -- Evita cadeia (A absorve B, B absorve C): o vencedor de verdade é a raiz.
  LOOP
    UPDATE _pares p
       SET p_venc = q.p_venc
      FROM _pares q
     WHERE p.p_venc = q.p_abs;
    EXIT WHEN NOT FOUND;
  END LOOP;

  FOR r IN SELECT * FROM _pares LOOP
    vencedor_id := r.p_venc;
    absorvido_id := r.p_abs;
    motivo := r.p_motivo;
    aplicado := false;

    IF p_aplicar THEN
      -- 1) cópia completa antes de qualquer mudança
      INSERT INTO public.leads_mesclados (lead_id, vencedor_id, linha)
      SELECT l.id, r.p_venc, to_jsonb(l) FROM public.leads l WHERE l.id = r.p_abs
      ON CONFLICT (lead_id) DO NOTHING;

      -- 2) o vencedor ganha o que lhe faltava; nada dele é sobrescrito
      UPDATE public.leads w
         SET name        = coalesce(nullif(btrim(w.name), ''), nullif(btrim(a.name), '')),
             email       = coalesce(nullif(btrim(w.email), ''), nullif(btrim(a.email), '')),
             phone       = coalesce(nullif(btrim(w.phone), ''), nullif(btrim(a.phone), '')),
             assigned_to = coalesce(w.assigned_to, a.assigned_to),
             score       = greatest(coalesce(w.score, 0), coalesce(a.score, 0)),
             metadata    = coalesce(a.metadata, '{}'::jsonb) || coalesce(w.metadata, '{}'::jsonb)
                           || jsonb_build_object(
                                'mesclados', coalesce(w.metadata->'mesclados', '[]'::jsonb) || to_jsonb(a.id::text),
                                'sessoes', coalesce(w.metadata->'sessoes', '[]'::jsonb)
                                           || coalesce(a.metadata->'sessoes', '[]'::jsonb)
                              )
        FROM public.leads a
       WHERE w.id = r.p_venc AND a.id = r.p_abs;

      -- 3) toda tabela que aponta para leads, descoberta no catálogo
      FOR fk IN
        SELECT c.conrelid::regclass AS tabela, att.attname AS coluna
          FROM pg_constraint c
          JOIN pg_attribute att
            ON att.attrelid = c.conrelid AND att.attnum = c.conkey[1]
         WHERE c.contype = 'f'
           AND c.confrelid = 'public.leads'::regclass
           AND array_length(c.conkey, 1) = 1
      LOOP
        -- linha a linha: se violar unicidade (ex.: a mesma etiqueta nos dois),
        -- a do absorvido é descartada — o vencedor já tem a equivalente.
        FOR linha IN EXECUTE format('SELECT ctid FROM %s WHERE %I = $1', fk.tabela, fk.coluna) USING r.p_abs
        LOOP
          BEGIN
            EXECUTE format('UPDATE %s SET %I = $1 WHERE ctid = $2', fk.tabela, fk.coluna)
              USING r.p_venc, linha.ctid;
          EXCEPTION WHEN unique_violation THEN
            EXECUTE format('DELETE FROM %s WHERE ctid = $1', fk.tabela) USING linha.ctid;
          END;
        END LOOP;
      END LOOP;

      -- 4) referências sem FK declarada que o produto usa
      UPDATE public.quiz_submissions SET lead_id = r.p_venc WHERE lead_id = r.p_abs;

      -- 5) só agora o lead absorvido sai
      DELETE FROM public.leads WHERE id = r.p_abs;
      aplicado := true;
    END IF;

    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.mesclar_leads_duplicados(boolean) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.mesclar_leads_duplicados(boolean) IS
  'Junta leads duplicados (mesma empresa + e-mail ou telefone normalizado). p_aplicar=false só relata.';
