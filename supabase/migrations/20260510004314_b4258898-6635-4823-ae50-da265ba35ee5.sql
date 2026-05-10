-- Update the trigger function to be more robust
CREATE OR REPLACE FUNCTION public.handle_lead_sync_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_trace_id TEXT := gen_random_uuid()::text;
    v_integration_exists BOOLEAN;
    v_jwt_claims JSONB;
BEGIN
    -- Check if company has an active CV.CRM integration
    SELECT EXISTS (
        SELECT 1 FROM public.cvcrm_integrations 
        WHERE company_id = NEW.company_id AND is_active = true
    ) INTO v_integration_exists;

    IF v_integration_exists THEN
        -- Insert initial delivery log
        INSERT INTO public.cvcrm_delivery_logs (company_id, lead_id, status, idempotency_key, trace_id)
        VALUES (NEW.company_id, NEW.id, 'queued', 'cvcrm-' || NEW.company_id || '-' || NEW.id, v_trace_id);

        -- Record timeline event
        INSERT INTO public.lead_timeline_events (company_id, lead_id, event_type, metadata)
        VALUES (NEW.company_id, NEW.id, 'cvcrm_delivery_queued', jsonb_build_object('trace_id', v_trace_id));
        
        -- Safely extract JWT claims if available
        BEGIN
            v_jwt_claims := current_setting('request.jwt.claims', true)::jsonb;
        EXCEPTION WHEN OTHERS THEN
            v_jwt_claims := NULL;
        END;

        -- Invoke Edge Function via pg_net
        -- We don't try to pass the Authorization header here if it's invalid
        -- The Edge Function should use service_role to verify if called internally or have a specific bypass
        PERFORM net.http_post(
            url := 'https://bbpyyvvoqwpzncaospnm.functions.supabase.co/send-cvcrm-lead',
            headers := jsonb_build_object(
                'Content-Type', 'application/json'
            ),
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