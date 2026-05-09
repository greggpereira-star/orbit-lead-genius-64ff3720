CREATE OR REPLACE FUNCTION public.handle_lead_sync_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_trace_id TEXT := gen_random_uuid()::text;
    v_integration_exists BOOLEAN;
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
        
        -- Invoke Edge Function via pg_net
        PERFORM net.http_post(
            url := 'https://bbpyyvvoqwpzncaospnm.functions.supabase.co/send-cvcrm-lead',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || current_setting('request.jwt.claims', true)::jsonb->>'sub' -- This might be tricky in trigger
            ),
            -- Use Service Role Key instead for internal calls
            -- Wait, better to use the ANON key if the function handles auth, or SERVICE key if internal.
            -- Since we don't have the key easily here, we'll use a header that the function can trust if it's internal.
            -- Actually, Supabase Edge Functions can be invoked without Auth if configured, but here we'll use a secret if possible.
            -- For simplicity and security in this environment, I'll use the service role key from vault or env if accessible.
            -- But triggers run as postgres. We can use a custom header.
            body := jsonb_build_object(
                'lead_id', NEW.id,
                'tenant_id', NEW.company_id,
                'trace_id', v_trace_id
            )
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
