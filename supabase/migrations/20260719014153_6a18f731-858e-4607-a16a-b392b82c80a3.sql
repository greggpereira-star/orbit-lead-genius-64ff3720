-- Habilitar pg_cron se ainda não estiver
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agendar para rodar a cada 1 hora. O agendamento é idempotente ou falha silenciosamente se tentarmos unschedule sem existir.
-- Vamos usar uma função anônima para fazer isso de forma segura.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'meta-retry-failed-jobs') THEN
        PERFORM cron.unschedule('meta-retry-failed-jobs');
    END IF;
END $$;

SELECT cron.schedule(
  'meta-retry-failed-jobs',
  '0 * * * *', -- A cada hora
  'SELECT net.http_post(''https://www.altleadflow.com.br/api/public/cron/meta-retry'', ''{"Content-Type": "application/json", "Authorization": "Bearer altflow_retry_sync_secret"}'', ''{}'')'
);

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
