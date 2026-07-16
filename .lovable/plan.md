# Fase 4 — Meta OAuth v25 + Lead Ads

Integração completa para conectar contas Meta (Facebook/Instagram), listar páginas e formulários de Lead Ads, receber leads em tempo real via webhook, salvar em `leads` e enviar ao CV.CRM.

## Escopo

1. **Credenciais da Meta App** (usuário fornece)
   - `META_APP_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_WEBHOOK_SECRET`
   - Instruído a criar app em developers.facebook.com com produto "Facebook Login" e "Webhooks", permissões `leads_retrieval`, `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `ads_management`
   - API version: `v25.0`

2. **Migration `meta_lead_connections`**
   - Guarda por `company_id`: `user_access_token` (long-lived), `user_id_meta`, `expires_at`, `granted_scopes`
   - Tabela `meta_lead_pages`: page_id, page_name, page_access_token, subscribed
   - Tabela `meta_lead_forms`: form_id, form_name, page_id, field_mapping (JSONB)
   - Tabela `meta_lead_events`: raw payload + processing status (idempotência via leadgen_id)
   - RLS por company_id + GRANTs

3. **OAuth flow** (server functions)
   - `src/lib/meta-oauth.functions.ts`:
     - `startMetaOAuth()`: gera state assinado, retorna URL de autorização v25 (`/dialog/oauth`)
     - `completeMetaOAuth({ code, state })`: troca code por token, faz `/oauth/access_token?grant_type=fb_exchange_token` para long-lived (60d), salva conexão
   - Rota `src/routes/_authenticated/integrations.meta.callback.tsx`: recebe `?code&state`, chama server fn, redireciona para settings
   - UI em `_authenticated/integrations.meta.tsx`: botão "Conectar Meta", lista páginas, toggle de subscribe por página, lista de formulários com mapeamento de campos → leads

4. **Assinatura de páginas e formulários**
   - `subscribePageToLeadgen(pageId)`: `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` com page access token
   - `listPageForms(pageId)`: `GET /{page-id}/leadgen_forms?fields=id,name,questions,status`
   - Mapeamento de campos: fullname→name, phone_number→phone, email→email + custom fields → metadata

5. **Webhook público** `src/routes/api/public/meta-leads-webhook.ts`
   - GET: verifica `hub.mode=subscribe` + `hub.verify_token === META_VERIFY_TOKEN`, retorna `hub.challenge`
   - POST: valida `x-hub-signature-256` (HMAC-SHA256 com app secret, timing-safe), insere raw event, aciona `processMetaLeadEvent()` inline (Response 200 rápido)
   - Idempotência: `unique(leadgen_id)` em `meta_lead_events`

6. **Processamento de lead**
   - Server-only helper `src/lib/meta-lead-processor.server.ts`:
     - Recebe `leadgen_id` + `page_id` + `form_id`
     - Busca token da página → `GET /{leadgen-id}?fields=field_data,created_time,ad_id,adset_id,campaign_id`
     - Aplica field_mapping → cria `leads` (com source=meta_leadads, utm_source=facebook, metadata com ad/campaign IDs)
     - Chama `send-cvcrm-lead` Edge Function (reaproveitando pipeline com retries + DLQ da Fase 3)

7. **UI de gestão** `_authenticated/integrations.meta.tsx`
   - Status da conexão (conectado/expirado, dias restantes)
   - Lista de páginas com switch de subscribe
   - Por página: lista de formulários com editor de field_mapping (drag-and-drop ou selects)
   - Últimos 20 eventos recebidos (do `meta_lead_events`) com status
   - Botão "Reconectar" quando expirado

8. **Observability**
   - Adicionar aba "Meta Lead Ads" em `_app.observability.tsx` mostrando eventos recentes + falhas de processamento

## Detalhes técnicos

- **Graph API base**: `https://graph.facebook.com/v25.0`
- **Long-lived token refresh**: server fn agendada (usar cron existente ou dispararsob demanda quando `expires_at < now() + 7d`)
- **Redirect URI**: `${VITE_APP_URL}/integrations/meta/callback` — usuário adiciona em Facebook App Settings
- **Segurança**: state HMAC-assinado com `META_APP_SECRET`, TTL 10min; webhook signature obrigatória; tokens nunca no client
- **Reuso**: pipeline CV.CRM (Fase 3) já lida com retries; só criamos o lead e disparamos

## Arquivos

**Novos:**
- `supabase/migrations/<ts>_meta_lead_ads.sql`
- `src/lib/meta-oauth.functions.ts`
- `src/lib/meta-lead-processor.server.ts`
- `src/lib/meta-graph.server.ts` (helpers HTTP para Graph API)
- `src/routes/api/public/meta-leads-webhook.ts`
- `src/routes/_authenticated/integrations.meta.tsx`
- `src/routes/_authenticated/integrations.meta.callback.tsx`
- `src/modules/meta/components/PageList.tsx`
- `src/modules/meta/components/FormMappingEditor.tsx`

**Modificados:**
- `src/routes/_app.observability.tsx` (aba Meta)
- Sidebar/nav em `AppLayout` (item "Integrações Meta")

## Secrets solicitados

Via `add_secret`:
- `META_APP_ID` (público, mas armazenado server-side pra consistência)
- `META_APP_SECRET`
- `META_VERIFY_TOKEN` (gerado — usuário cola no Facebook Webhook config)
- `META_WEBHOOK_SECRET` (= App Secret; usado para HMAC do webhook)

## Ordem de execução

1. Migration + GRANTs + RLS
2. Solicitar secrets Meta (add_secret)
3. Helpers Graph API + processor
4. Server functions OAuth
5. Webhook route
6. UI (conectar, páginas, formulários, mapeamento)
7. Aba Observability
8. Typecheck + smoke test

**Confirma?** Ao aprovar eu já solicito os 4 secrets Meta e começo a migration.