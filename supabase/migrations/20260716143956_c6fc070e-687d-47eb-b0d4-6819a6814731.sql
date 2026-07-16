GRANT SELECT ON public.cvcrm_delivery_logs TO authenticated;
GRANT SELECT, UPDATE ON public.cvcrm_dead_letter_queue TO authenticated;
GRANT ALL ON public.cvcrm_delivery_logs TO service_role;
GRANT ALL ON public.cvcrm_dead_letter_queue TO service_role;

DROP POLICY IF EXISTS "Users can view their company delivery logs" ON public.cvcrm_delivery_logs;
CREATE POLICY "Users can view their company delivery logs"
ON public.cvcrm_delivery_logs
FOR SELECT
TO authenticated
USING (public.check_membership(company_id));

DROP POLICY IF EXISTS "Users can manage their company DLQ" ON public.cvcrm_dead_letter_queue;
CREATE POLICY "Users can view their company DLQ"
ON public.cvcrm_dead_letter_queue
FOR SELECT
TO authenticated
USING (public.check_membership(company_id));

CREATE POLICY "Users can update their company DLQ resolution"
ON public.cvcrm_dead_letter_queue
FOR UPDATE
TO authenticated
USING (public.check_membership(company_id))
WITH CHECK (public.check_membership(company_id));

CREATE INDEX IF NOT EXISTS idx_cvcrm_delivery_logs_company_status_created
ON public.cvcrm_delivery_logs(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cvcrm_dead_letter_queue_company_resolved_created
ON public.cvcrm_dead_letter_queue(company_id, resolved_at, created_at DESC);