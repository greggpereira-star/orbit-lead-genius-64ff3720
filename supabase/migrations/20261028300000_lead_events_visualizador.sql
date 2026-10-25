-- lead_events: o visualizador não grava na linha do tempo do lead.
--
-- Achado em teste ao vivo: `lead_events` não tem `company_id` (liga ao lead por `lead_id`), então
-- ficou de fora das varreduras anteriores, que só olhavam tabelas com `company_id`. Pelo botão
-- "Mover para outra etapa" o visualizador gravaria um evento "Movido de X para Y" num lead que
-- NÃO mudou (o UPDATE em `leads` é filtrado em silêncio, mas o INSERT do evento passava).
--
-- Política restritiva (só barra): inserir aceita lead nulo (eventos sem lead) ou lead de empresa
-- em que a pessoa escreve; alterar e apagar exigem o mesmo. As capturas públicas gravam como
-- `anon` e não passam por aqui. `form_events` (análise de formulários públicos) fica de fora de
-- propósito: nasce de visitantes, sem lead.
DROP POLICY IF EXISTS leitura_apenas_insert ON public.lead_events;
DROP POLICY IF EXISTS leitura_apenas_update ON public.lead_events;
DROP POLICY IF EXISTS leitura_apenas_delete ON public.lead_events;
CREATE POLICY leitura_apenas_insert ON public.lead_events AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (lead_id IS NULL OR public.pode_escrever_na_empresa(public.empresa_do_lead(lead_id)));
CREATE POLICY leitura_apenas_update ON public.lead_events AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.pode_escrever_na_empresa(public.empresa_do_lead(lead_id)))
  WITH CHECK (public.pode_escrever_na_empresa(public.empresa_do_lead(lead_id)));
CREATE POLICY leitura_apenas_delete ON public.lead_events AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.pode_escrever_na_empresa(public.empresa_do_lead(lead_id)));
