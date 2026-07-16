
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'retry-cvcrm-delivery-every-minute';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'retry-cvcrm-delivery-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://nckxdcocmwvgevazyuac.supabase.co/functions/v1/retry-cvcrm-delivery',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ja3hkY29jbXd2Z2V2YXp5dWFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0OTI1NzMsImV4cCI6MjA5NDA2ODU3M30.Y4s1cF97o8a-ABTkt0PAD7xnkjUUV3Wm_hLumvQsjBY'
    ),
    body := jsonb_build_object('source', 'pg_cron')
  );
  $$
);
