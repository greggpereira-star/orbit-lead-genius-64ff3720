-- Remove os apontamentos para a infraestrutura anterior à VPS.
--
-- Três coisas ficaram para trás na migração do Supabase hospedado / Lovable
-- para a VPS, e continuaram rodando contra endereços que não existem mais:
--
--   cron retry-cvcrm-delivery  -> nckxdcocmwvgevazyuac.supabase.co  (a cada 1 min)
--   cron whatsapp_capi_retry   -> project--5d40….lovable.app        (a cada 5 min)
--   trigger de lead            -> bbpyyvvoqwpzncaospnm.functions.supabase.co
--
-- Backup do estado anterior em /root/backups/ na VPS (cron_jobs_20260726.tsv e
-- handle_lead_sync_trigger_20260726.sql), caso algo precise ser restaurado.

-- ---------------------------------------------------------------------------
-- 1. CV.CRM: remover o cron
-- ---------------------------------------------------------------------------

-- Batia de minuto em minuto num projeto Supabase desativado, carregando um JWT
-- antigo em texto puro dentro do próprio comando (visível a quem lê cron.job).
-- Não há o que reprocessar: cvcrm_integrations, cvcrm_delivery_logs e
-- lead_timeline_events estão todos zerados, e o endpoint de entrega não foi
-- reconstruído nesta instalação.
DO $$
BEGIN
  PERFORM cron.unschedule('retry-cvcrm-delivery-every-minute');
EXCEPTION WHEN OTHERS THEN
  -- Já removido: a migration precisa poder rodar duas vezes.
  NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. WhatsApp CAPI: repontar, não remover
-- ---------------------------------------------------------------------------

-- Este continua fazendo falta — `src/routes/api/public/whatsapp-capi-retry.ts`
-- existe no app atual e já aceita o mesmo bearer guardado em
-- app_internal_config. Só o endereço estava velho.
DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp_capi_retry_5min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'whatsapp_capi_retry_5min',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://www.altleadflow.com.br/api/public/whatsapp-capi-retry',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer ' || (SELECT value FROM public.app_internal_config WHERE key = 'wa_capi_retry_bearer')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $job$
);

-- ---------------------------------------------------------------------------
-- 3. Trigger de lead: endereço vem de configuração, não do código
-- ---------------------------------------------------------------------------

-- O host estava cravado dentro da função, que é como ele sobreviveu à migração
-- sem ninguém notar. Agora sai de `app_internal_config.cvcrm_endpoint_url`: sem
-- essa chave, o disparo simplesmente não acontece — e o log fica registrado
-- assim mesmo, para o lead não sumir do histórico.
--
-- Hoje isso é preventivo (não há integração ativa). Vale para o dia em que
-- alguém ligar o CV.CRM e o gatilho tentar chamar um servidor desligado.
CREATE OR REPLACE FUNCTION public.handle_lead_sync_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_trace_id TEXT := gen_random_uuid()::text;
    v_integration_exists BOOLEAN;
    v_endpoint TEXT;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.cvcrm_integrations
        WHERE company_id = NEW.company_id AND is_active = true
    ) INTO v_integration_exists;

    IF NOT v_integration_exists THEN
        RETURN NEW;
    END IF;

    SELECT value INTO v_endpoint
      FROM public.app_internal_config
     WHERE key = 'cvcrm_endpoint_url';

    INSERT INTO public.cvcrm_delivery_logs (company_id, lead_id, status, idempotency_key, trace_id)
    VALUES (
        NEW.company_id, NEW.id,
        CASE WHEN v_endpoint IS NULL THEN 'skipped' ELSE 'queued' END,
        'cvcrm-' || NEW.company_id || '-' || NEW.id,
        v_trace_id
    );

    INSERT INTO public.lead_timeline_events (company_id, lead_id, event_type, metadata)
    VALUES (
        NEW.company_id, NEW.id,
        CASE WHEN v_endpoint IS NULL
             THEN 'cvcrm_delivery_skipped_no_endpoint'
             ELSE 'cvcrm_delivery_queued' END,
        jsonb_build_object('trace_id', v_trace_id)
    );

    IF v_endpoint IS NOT NULL THEN
        PERFORM net.http_post(
            url := v_endpoint,
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body := jsonb_build_object(
                'lead_id', NEW.id,
                'tenant_id', NEW.company_id,
                'trace_id', v_trace_id,
                'is_internal_trigger', true
            )
        );
    END IF;

    RETURN NEW;
END;
$function$;
