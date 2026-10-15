-- WhatsApp oficial — Fase 5: mídia, notas internas e uso por categoria.
--
-- Depende das migrações `wa_*` anteriores. NÃO foi executada contra a base de
-- produção; ensaiada num Postgres 16 descartável.

-- ---------------------------------------------------------------------------
-- 1. Mídia
-- ---------------------------------------------------------------------------
-- Bucket PRIVADO. Ninguém lê direto: a tela pede uma URL assinada curta ao
-- servidor, que confere a empresa antes. 25 MB cobre imagem, áudio, vídeo e
-- documento dentro do que o produto aceita enviar.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('wa-media', 'wa-media', false, 26214400)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.wa_media
  ADD COLUMN IF NOT EXISTS kind text,
  ADD COLUMN IF NOT EXISTS filename text,
  -- pending: ainda não baixada · stored: no bucket · failed · expired: a Meta
  -- já não serve mais (a mídia recebida expira; baixar cedo é o que evita isso).
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'stored', 'failed', 'expired')),
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS wa_media_provider_uniq
  ON public.wa_media (company_id, provider_media_id)
  WHERE provider_media_id IS NOT NULL;

-- Liga uma mensagem à sua mídia. Idempotente: reentrega do webhook não cria
-- segunda linha nem troca a mídia de uma mensagem que já a tem.
CREATE OR REPLACE FUNCTION public.wa_registrar_midia(
  p_message_id uuid,
  p_kind text,
  p_provider_media_id text,
  p_mime text,
  p_sha256 text,
  p_filename text,
  p_storage_path text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_msg public.wa_messages%ROWTYPE;
  v_media uuid;
BEGIN
  SELECT * INTO v_msg FROM public.wa_messages WHERE id = p_message_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'mensagem_inexistente' USING ERRCODE = 'P0002'; END IF;
  IF v_msg.media_id IS NOT NULL THEN RETURN v_msg.media_id; END IF;

  IF p_provider_media_id IS NOT NULL THEN
    INSERT INTO public.wa_media (company_id, provider_media_id, mime, sha256, kind, filename, status, storage_path)
    VALUES (v_msg.company_id, p_provider_media_id, p_mime, p_sha256, p_kind, p_filename,
            CASE WHEN p_storage_path IS NULL THEN 'pending' ELSE 'stored' END, p_storage_path)
    ON CONFLICT (company_id, provider_media_id) WHERE provider_media_id IS NOT NULL
      DO UPDATE SET mime = coalesce(public.wa_media.mime, EXCLUDED.mime)
    RETURNING id INTO v_media;
  ELSE
    -- Mídia ENVIADA por nós: não tem id da Meta; o arquivo já está no bucket.
    INSERT INTO public.wa_media (company_id, mime, kind, filename, status, storage_path, fetched_at)
    VALUES (v_msg.company_id, p_mime, p_kind, p_filename, 'stored', p_storage_path, now())
    RETURNING id INTO v_media;
  END IF;

  UPDATE public.wa_messages SET media_id = v_media WHERE id = p_message_id;
  RETURN v_media;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_registrar_midia(uuid,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_registrar_midia(uuid,text,text,text,text,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Notas internas
-- ---------------------------------------------------------------------------
-- Nunca vão ao cliente: tabela à parte (e não uma "mensagem" com flag) para que
-- nenhum caminho de envio consiga, por engano, mandá-las.
CREATE TABLE IF NOT EXISTS public.wa_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wa_notes_conversa_idx ON public.wa_notes (conversation_id, created_at);

ALTER TABLE public.wa_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_notes_leitura ON public.wa_notes;
CREATE POLICY wa_notes_leitura ON public.wa_notes
  FOR SELECT TO authenticated USING (public.check_membership(company_id));
GRANT SELECT ON public.wa_notes TO authenticated;
GRANT ALL ON public.wa_notes TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Uso por categoria (base do custo)
-- ---------------------------------------------------------------------------
-- Conta mensagens COBRÁVEIS por categoria a partir do `pricing` que a Meta manda
-- nos status. É CONTAGEM, não valor em reais: a tabela de preços em BRL não é
-- dado do banco, e inventar valor aqui seria publicar número falso.
--
-- SECURITY INVOKER (o padrão): o RLS de `wa_message_status_events` decide o que
-- o usuário enxerga, então a função nunca devolve dado de outra empresa.
CREATE OR REPLACE FUNCTION public.wa_uso_por_categoria(
  p_company_id uuid,
  p_desde timestamptz,
  p_ate timestamptz
)
RETURNS TABLE (categoria text, cobravel boolean, total bigint)
LANGUAGE sql
STABLE
AS $$
  -- Uma mensagem pode ter vários status com `pricing`; vale uma vez só.
  WITH por_mensagem AS (
    SELECT DISTINCT ON (e.provider_message_id)
           e.provider_message_id,
           coalesce(e.pricing ->> 'category', 'desconhecida') AS categoria,
           coalesce((e.pricing ->> 'billable')::boolean, false) AS cobravel
      FROM public.wa_message_status_events e
     WHERE e.company_id = p_company_id
       AND e.pricing IS NOT NULL
       AND e.occurred_at >= p_desde
       AND e.occurred_at < p_ate
     ORDER BY e.provider_message_id, e.occurred_at
  )
  SELECT categoria, cobravel, count(*)::bigint
    FROM por_mensagem
   GROUP BY categoria, cobravel
   ORDER BY cobravel DESC, categoria;
$$;

GRANT EXECUTE ON FUNCTION public.wa_uso_por_categoria(uuid, timestamptz, timestamptz) TO authenticated, service_role;
