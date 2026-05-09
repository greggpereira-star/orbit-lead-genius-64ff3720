-- Tabela de Eventos de Formulário
CREATE TABLE IF NOT EXISTS public.form_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.profiles(id), -- Corrigido para a coluna 'id' da tabela profiles
    form_id UUID REFERENCES public.forms(id) ON DELETE CASCADE,
    form_slug TEXT,
    event_name TEXT NOT NULL,
    event_type TEXT, -- tracking, interaction, conversion, error
    source TEXT, -- sdk, iframe, direct, script
    embed_mode TEXT, -- inline, popup, floating, ecommerce
    page_url TEXT,
    referrer TEXT,
    session_id TEXT,
    visitor_id TEXT,
    lead_id UUID,
    submission_id UUID,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    gclid TEXT,
    fbclid TEXT,
    gbraid TEXT,
    wbraid TEXT,
    device TEXT,
    browser TEXT,
    os TEXT,
    country TEXT,
    city TEXT,
    ecommerce_context JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexação
CREATE INDEX IF NOT EXISTS idx_form_events_tenant_id ON public.form_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_form_events_form_id ON public.form_events(form_id);
CREATE INDEX IF NOT EXISTS idx_form_events_event_name ON public.form_events(event_name);
CREATE INDEX IF NOT EXISTS idx_form_events_created_at ON public.form_events(created_at);

-- Tabela de Auditoria de Exportação
CREATE TABLE IF NOT EXISTS public.export_audit_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES public.profiles(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    form_id UUID REFERENCES public.forms(id) ON DELETE SET NULL,
    export_type TEXT NOT NULL,
    filters JSONB DEFAULT '{}'::jsonb,
    status TEXT NOT NULL,
    file_url TEXT,
    row_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Ativar RLS
ALTER TABLE public.form_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_audit_logs ENABLE ROW LEVEL SECURITY;

-- Políticas
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Tenants can view their own form events') THEN
        CREATE POLICY "Tenants can view their own form events" ON public.form_events FOR SELECT USING (auth.uid() = tenant_id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can insert form events via SDK') THEN
        CREATE POLICY "Public can insert form events via SDK" ON public.form_events FOR INSERT WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Tenants can view their own export logs') THEN
        CREATE POLICY "Tenants can view their own export logs" ON public.export_audit_logs FOR SELECT USING (auth.uid() = tenant_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create export logs') THEN
        CREATE POLICY "Users can create export logs" ON public.export_audit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
