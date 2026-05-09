-- Create sessions table
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    visitor_id TEXT NOT NULL,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    gclid TEXT,
    fbclid TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create page_views table
CREATE TABLE IF NOT EXISTS public.page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

-- Policies for sessions
-- Allow anyone to insert a session (it's for tracking)
CREATE POLICY "Allow public session insertion" ON public.sessions
    FOR INSERT WITH CHECK (true);

-- Allow company members to view sessions
CREATE POLICY "Users can view their company sessions" ON public.sessions
    FOR SELECT USING (auth.uid() IN (SELECT user_id FROM memberships WHERE company_id = sessions.company_id));

-- Policies for page_views
CREATE POLICY "Allow public page_view insertion" ON public.page_views
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can view their company page_views" ON public.page_views
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM sessions
            JOIN memberships ON memberships.company_id = sessions.company_id
            WHERE sessions.id = page_views.session_id AND memberships.user_id = auth.uid()
        )
    );
