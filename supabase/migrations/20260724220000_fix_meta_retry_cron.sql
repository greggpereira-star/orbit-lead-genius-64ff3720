-- Corrige o job "meta-retry-failed-jobs" (criado em 20260719014153): o
-- net.http_post original passava os headers como 2º argumento posicional (que na
-- verdade é o parâmetro `body`), então o header "Authorization" nunca era enviado
-- de verdade — o endpoint sempre respondia 401 Unauthorized (confirmado ao vivo em
-- net._http_response). Também aumenta a frequência de 1h pra 10min: como esse
-- cron só reprocessa jobs com status failed/completed_with_errors (a entrada
-- normal de leads continua sendo via webhook em tempo real), 10min dá uma
-- recuperação bem mais rápida sem sobrecarregar a Graph API — cada execução já é
-- limitada a 10 jobs e agora respeita retry_count (ver fix em meta-retry.ts).

DO $$
DECLARE jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'meta-retry-failed-jobs';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

SELECT cron.schedule(
  'meta-retry-failed-jobs',
  '*/10 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://www.altleadflow.com.br/api/public/cron/meta-retry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer altflow_retry_sync_secret'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
