
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Internal config store (service_role only)
CREATE TABLE IF NOT EXISTS public.app_internal_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.app_internal_config TO service_role;
ALTER TABLE public.app_internal_config ENABLE ROW LEVEL SECURITY;
-- No policies: only service_role (bypasses RLS) can read/write.

-- Seed retry bearer with a strong random value (only if missing)
INSERT INTO public.app_internal_config(key, value)
VALUES ('wa_capi_retry_bearer', encode(gen_random_bytes(36), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- Unschedule previous job if it exists (idempotent re-run)
DO $$
DECLARE jid int;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'whatsapp_capi_retry_5min';
  IF jid IS NOT NULL THEN PERFORM cron.unschedule(jid); END IF;
END $$;

-- Schedule retry every 5 minutes
SELECT cron.schedule(
  'whatsapp_capi_retry_5min',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--5d4053e9-e197-4195-8f1f-86c12b809081.lovable.app/api/public/whatsapp-capi-retry',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (SELECT value FROM public.app_internal_config WHERE key = 'wa_capi_retry_bearer')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $cron$
);
