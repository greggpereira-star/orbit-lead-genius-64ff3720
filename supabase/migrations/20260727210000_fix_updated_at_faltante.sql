-- Três tabelas tinham o gatilho de `updated_at` e não tinham a coluna.
--
-- O gatilho é `BEFORE UPDATE ... NEW.updated_at = now()`. Sem a coluna, o
-- Postgres recusa a linha inteira com `record "new" has no field "updated_at"`.
-- Efeito prático: **qualquer UPDATE nessas tabelas sempre falhou**, desde
-- sempre. INSERT funcionava, o que escondeu o problema — só aparecia quando a
-- linha já existia.
--
-- Foi assim que apareceu: conectar o Google Ads grava em `integrations` com
-- upsert. Na primeira empresa a linha não existia e entrou como INSERT; na
-- Sossae a linha já tinha sido criada pela tela de pixel, o upsert virou
-- UPDATE, e a conexão morreu no gatilho.
--
-- O mesmo defeito atingia:
--   `cvcrm_sync_queue` — uma fila cujo estado nunca pôde avançar por UPDATE.
--   `chat_messages`    — nenhuma mensagem pôde ser alterada depois de criada.
--
-- Outras 30 tabelas do schema têm gatilho e coluna. A convenção é essa; estas
-- três é que estavam fora. Por isso acrescentamos a coluna em vez de remover o
-- gatilho: alinhar a exceção à regra, não abrir uma exceção nova.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['integrations', 'chat_messages', 'cvcrm_sync_queue'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t)
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = t
                          AND column_name = 'updated_at') THEN

      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now()', t);

      -- Linha antiga nunca foi alterada — não podia. `created_at` é a data
      -- honesta para ela; `now()` diria que tudo mudou no dia da migration.
      IF EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = t
                    AND column_name = 'created_at') THEN
        EXECUTE format(
          'UPDATE public.%I SET updated_at = created_at WHERE created_at IS NOT NULL', t);
      END IF;

      RAISE NOTICE 'updated_at adicionada em %', t;
    END IF;
  END LOOP;
END $$;
