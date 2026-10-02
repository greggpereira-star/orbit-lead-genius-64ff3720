-- Agenda o despacho das conversões enfileiradas pelo gatilho de etapa.
--
-- A cada 5 minutos, e não a cada minuto: a janela da CAPI é de 7 dias, então
-- alguns minutos de atraso não custam atribuição nenhuma, e bater de minuto em
-- minuto só gastaria cota numa fila que quase sempre está vazia.

SELECT cron.unschedule('despacho-conversao') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'despacho-conversao'
);

SELECT cron.schedule(
  'despacho-conversao',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://www.altleadflow.com.br/api/public/cron/conversion-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer altflow_retry_sync_secret'
    ),
    body := '{}'::jsonb
  );
  $$
);
