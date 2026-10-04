-- O job que processa a fila de automação
--
-- De minuto em minuto, e não de 5 em 5 como o despacho de conversão: a
-- automação é o que o cliente percebe acontecendo (a etiqueta aparece, o
-- WhatsApp chega), e 5 minutos de espera para uma saudação automática já soa
-- como esquecimento.
--
-- Passa por HTTP, e não por função no banco, porque as ações precisam de
-- segredo que vive no `.env` do servidor — chave da Evolution, cabeçalho do
-- webhook do cliente.

select cron.schedule(
  'despacho-automacao',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://www.altleadflow.com.br/api/public/cron/automation-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer altflow_retry_sync_secret'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
  $cron$
);
