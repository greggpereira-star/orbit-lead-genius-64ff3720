# Meta Lead Ads — Sincronização de formulários + roteamento para CRM

Escopo grande. Vou entregar em 4 blocos, cada um funcional por si só. Você aprova este plano e eu começo pelo Bloco 1.

## Bloco 1 — Sincronização de formulários (base)

**Migration**
- Ajustar `meta_lead_forms`: garantir colunas `page_name`, `leads_count`, `questions jsonb`, `raw_payload jsonb`, `last_synced_at`. Unique `(company_id, form_id)`. GRANTs.
- Criar `meta_form_mappings` com todos os campos do STEP 6 (pipeline/stage/assigned_to/tags/score/temperature/qualification_rules/external_crm_*). Unique `(company_id, form_id)`. RLS por company.
- Criar `meta_lead_import_jobs` (STEP 7). RLS por company.
- Ajustar `meta_lead_events`: adicionar `fetched_lead_payload`, `normalized_payload`, `trace_id`, status `unmapped_form`.

**Server functions** (`src/lib/meta-forms.functions.ts`)
- `syncMetaLeadForms({ pageId })` — busca `/v25.0/{page_id}/leadgen_forms` com o page_access_token salvo, upsert em `meta_lead_forms`, retorna resumo + trace_id.
- `listMetaForms({ pageId? })` — lê formulários salvos + mapping ativo (join).
- `saveMetaFormMapping(input)` — upsert em `meta_form_mappings`.
- `deleteMetaFormMapping({ id })`.
- Todas com `requireSupabaseAuth` + validação de `company_id` via membership.

**UI** (`_app.integrations.meta.tsx`)
- Em cada card de página: botões **Sincronizar Formulários**, **Ver Formulários**.
- Nova seção **Formulários Meta**: tabela com Página | Formulário | Status | Leads | Última sync | Pipeline | Etapa | CRM externo | Ações (Configurar / Importar / Testar / Desativar).
- Estados vazio e diagnóstico de permissão (`leads_retrieval` / `pages_manage_metadata` / token expirado) com mensagens específicas quando Graph retorna 190/200/10.

## Bloco 2 — Configurar mapeamento (drawer 5 etapas)

Drawer com steps: Origem → Destino Alt LeadFlow → Qualificação → CRM externo opcional → Revisar.
- Reaproveita `stages`/pipelines já existentes e `memberships` para responsáveis.
- Editor simples de regras (`campo/operador/valor/ação`) salvo em `qualification_rules jsonb`.
- CRM externo: select filtrado por integrações ativas da company (`cvcrm_integrations`, futuros); só mostra CV.CRM se company tem `cvcrm_integrations.is_active=true`. Sem integração ativa → mensagem "Nenhum CRM externo ativo. Leads serão salvos apenas no Alt LeadFlow." (não bloqueia).
- Persistência via `saveMetaFormMapping`.

## Bloco 3 — Pipeline de ingestão (webhook + normalização + processIncomingLead)

- Refactor `src/lib/meta-lead-processor.server.ts`:
  - `normalizeMetaLead(payload, mapping)` puro e testável (mapeia full_name/email/phone_number/whatsapp, mantém answers, monta UTMs com fallback do mapping, extrai campaign/adset/ad quando disponíveis).
  - `processIncomingLead(input)` como função central; a Meta é um dos callers.
  - Enrichment opcional via Graph (`/{ad_id}`, `/{campaign_id}`, `/{adset_id}`) com try/catch — falha vira warning.
  - Se não há mapping ativo → status `unmapped_form`, sem perder payload.
  - Dedup por `(company_id, meta_leadgen_id)`.
  - Envio a CRM externo só via `shouldSendToExternalCRM(lead, mapping, integrations)`; CV.CRM continua opcional (usa `cvcrm_integrations.is_active`).
- Webhook `/api/public/meta-webhook`: chama o processor novo, gera `trace_id`, grava eventos com status correto.

## Bloco 4 — Importação, reprocessamento, teste, eventos e logs

- `importMetaLeads({ formId, since, until })` server fn — pagina `/v25.0/{form_id}/leads`, chama processor, retorna `total_found/imported/duplicates/failed` e persiste em `meta_lead_import_jobs`.
- `reprocessMetaEvent({ eventId })` e `reprocessUnmappedForm({ formId })`.
- `sendTestLead({ formMappingId })` — payload fake baseado em `questions`, marca `metadata.is_test=true`, respeita flag "enviar teste para CRM externo".
- UI:
  - Seção **Mapeamentos Ativos** (tabela + ações).
  - Seção **Eventos Recentes** enriquecida (horário/página/form/lead/status/CRM/trace_id/erro).
  - Botão **Reprocessar** individual e em massa (eventos com erro / eventos de um form recém-mapeado).

## Detalhes técnicos

- Tokens Meta: reutilizar `page_access_token` salvo em `meta_lead_pages`. Nunca chamar Graph pelo browser.
- Todas as chamadas Graph passam por `meta-graph.server.ts` (já existe `META_API_VERSION=v25.0`).
- Idempotência: unique `(company_id, meta_leadgen_id)` em `meta_lead_events` + check por `metadata->>'meta_leadgen_id'` antes de criar lead.
- CV.CRM permanece 100% opcional: nenhum caminho de código quebra se company não tem `cvcrm_integrations` ativa. Envio via `queueService.enqueue('send_cvcrm_lead', ...)`.
- Abstração `dispatchLeadToCRM(provider, lead, config)` para permitir hubspot/rdstation/webhook depois — implementação inicial só com `cvcrm` e `webhook` genérico.
- Logs estruturados com `trace_id` (uuid por evento) via `logger`.
- Sem edge functions novas: tudo em TanStack server functions + processor server-only.

## Ordem de entrega

1. Bloco 1 (migration + sync + UI de listagem).
2. Bloco 2 (drawer de mapeamento).
3. Bloco 3 (ingestão real + dedup + CRM opcional).
4. Bloco 4 (importação, reprocessamento, teste, eventos ricos).

Aprova este plano para eu começar pelo Bloco 1?
