-- RLS Policy for lead sync logs
CREATE POLICY "Users can view their company's lead sync logs"
ON public.lead_sync_logs FOR SELECT
USING (EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.company_id = lead_sync_logs.company_id
    AND memberships.user_id = auth.uid()
));
