-- Rename existing tables if they exist to avoid conflicts or just modify them
-- We'll try to keep data if possible, but the structure is significantly different

-- Create or Update cvcrm_integrations
CREATE TABLE IF NOT EXISTS public.cvcrm_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    base_url TEXT,
    subdomain TEXT NOT NULL,
    integration_user TEXT NOT NULL,
    encrypted_api_token TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    connection_status TEXT DEFAULT 'disconnected',
    last_tested_at TIMESTAMP WITH TIME ZONE,
    last_success_at TIMESTAMP WITH TIME ZONE,
    last_error_at TIMESTAMP WITH TIME ZONE,
    last_error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(company_id)
);

-- Ensure RLS is enabled
ALTER TABLE public.cvcrm_integrations ENABLE ROW LEVEL SECURITY;

-- Policy for cvcrm_integrations
DO $$ BEGIN
    CREATE POLICY "Users can manage their company cvcrm integration" ON public.cvcrm_integrations
    USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = cvcrm_integrations.company_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- cvcrm_field_mappings
CREATE TABLE IF NOT EXISTS public.cvcrm_field_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    cvcrm_integration_id UUID NOT NULL REFERENCES public.cvcrm_integrations(id) ON DELETE CASCADE,
    leadflow_field TEXT NOT NULL,
    cvcrm_field TEXT NOT NULL,
    cvcrm_custom_field_id TEXT,
    is_custom_field BOOLEAN DEFAULT false,
    required BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.cvcrm_field_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company field mappings" ON public.cvcrm_field_mappings
USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = cvcrm_field_mappings.company_id));

-- cvcrm_delivery_logs (Replacing or augmenting cvcrm_sync_logs)
CREATE TABLE IF NOT EXISTS public.cvcrm_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    trace_id TEXT,
    idempotency_key TEXT,
    status TEXT NOT NULL, -- 'queued', 'sending', 'success', 'failed', 'retrying'
    attempt_count INTEGER DEFAULT 1,
    request_payload JSONB,
    response_payload JSONB,
    status_code INTEGER,
    error_message TEXT,
    cvcrm_lead_id TEXT,
    sent_at TIMESTAMP WITH TIME ZONE,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.cvcrm_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their company delivery logs" ON public.cvcrm_delivery_logs
FOR SELECT USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = cvcrm_delivery_logs.company_id));

-- cvcrm_dead_letter_queue
CREATE TABLE IF NOT EXISTS public.cvcrm_dead_letter_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    trace_id TEXT,
    delivery_log_id UUID REFERENCES public.cvcrm_delivery_logs(id) ON DELETE SET NULL,
    failure_reason TEXT,
    payload JSONB,
    last_error TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.cvcrm_dead_letter_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their company DLQ" ON public.cvcrm_dead_letter_queue
USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = cvcrm_dead_letter_queue.company_id));

-- lead_timeline_events
CREATE TABLE IF NOT EXISTS public.lead_timeline_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- e.g. 'cvcrm_delivery_queued', etc.
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.lead_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead timeline events" ON public.lead_timeline_events
FOR SELECT USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = lead_timeline_events.company_id));

-- Drop old tables if they are redundant and not used elsewhere
-- DROP TABLE IF EXISTS public.cvcrm_sync_queue;
-- DROP TABLE IF EXISTS public.cvcrm_sync_logs;

-- Function to handle automatic sync on lead creation
CREATE OR REPLACE FUNCTION public.handle_lead_sync_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger if the company has an active CV.CRM integration
    IF EXISTS (SELECT 1 FROM public.cvcrm_integrations WHERE company_id = NEW.company_id AND is_active = true) THEN
        -- Insert into delivery logs (queued state)
        INSERT INTO public.cvcrm_delivery_logs (company_id, lead_id, status, idempotency_key)
        VALUES (NEW.company_id, NEW.id, 'queued', 'cvcrm-' || NEW.company_id || '-' || NEW.id);

        -- Record timeline event
        INSERT INTO public.lead_timeline_events (company_id, lead_id, event_type)
        VALUES (NEW.company_id, NEW.id, 'cvcrm_delivery_queued');
        
        -- Trigger edge function call (via pg_net or similar if available, otherwise we rely on a worker polling or a webhook)
        -- Since we're in Supabase, we can use a trigger to call a function that calls the edge function
        -- Or simply let the Edge Function be triggered by a Supabase Hook.
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for lead creation
DROP TRIGGER IF EXISTS on_lead_created_sync ON public.leads;
CREATE TRIGGER on_lead_created_sync
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.handle_lead_sync_trigger();

-- Trigger for update_updated_at_column if not exists
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_cvcrm_integrations_updated_at ON public.cvcrm_integrations;
CREATE TRIGGER update_cvcrm_integrations_updated_at BEFORE UPDATE ON public.cvcrm_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cvcrm_field_mappings_updated_at ON public.cvcrm_field_mappings;
CREATE TRIGGER update_cvcrm_field_mappings_updated_at BEFORE UPDATE ON public.cvcrm_field_mappings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cvcrm_delivery_logs_updated_at ON public.cvcrm_delivery_logs;
CREATE TRIGGER update_cvcrm_delivery_logs_updated_at BEFORE UPDATE ON public.cvcrm_delivery_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
