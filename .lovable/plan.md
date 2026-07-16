# Lead Scoring & Routing — Fase 5

Objetivo: transformar todo lead que entra (Quiz, Form, Meta) em um lead **pontuado, classificado (hot/warm/cold) e atribuído a um vendedor** automaticamente, com painel de configuração.

## 1. Banco de dados (migration única)

Duas tabelas novas + coluna direta em `leads`:

- `routing_configs` — 1 por empresa: `id, company_id, name, strategy ('round_robin'|'performance'|'hybrid'), is_active, fallback_user_id`.
- `routing_members` — vendedores no pool: `id, config_id, user_id, performance_score (0-100), weight, is_available, last_assigned_at`.
- `leads.assigned_to uuid` — coluna direta (hoje mora em `metadata`, difícil filtrar).

RLS: `authenticated` só acessa linhas onde é membro da company. GRANTs completos.

Já existem: `form_scoring_rules`, `form_temperature_rules`, `form_tag_rules`, `lead_scores` — reaproveitados.

## 2. Engine de scoring unificado

Novo módulo `src/modules/intelligence/services/leadScoringEngine.ts`:

- `scoreLead(lead, answers, companyId)` → aplica `form_scoring_rules` (condition JSONB avaliada com operadores `eq/gt/lt/contains/in`), soma `score_delta`, coleta tags e ação recomendada.
- Deriva `temperature` via `form_temperature_rules` (faixa min/max) — fallback global hot≥70, warm≥40, cold<40.
- Grava histórico em `lead_scores` (audit trail) + atualiza `leads.score`, `leads.temperature`.

## 3. Routing engine

Refactor de `routingService.assignLead`:

- Estratégia `round_robin`: menor `last_assigned_at`.
- `performance`: pondera por `performance_score` (leads hot vão para top ≥80).
- `hybrid` (default): hot → performance; warm/cold → round_robin.
- Cai no `fallback_user_id` se pool vazio.
- Grava `leads.assigned_to`, atualiza `last_assigned_at`, cria evento em `lead_events`.

## 4. Integração automática

Wire no pipeline de captura:

- `quizService.submitPublic` (após criar lead) → `scoreLead` → `assignLead`.
- `captureService` (form público) → mesmo hook.
- `meta-lead-processor.server.ts` → mesmo hook.

## 5. UI de configuração

Nova rota `/_app.settings.routing.tsx`:

- **Aba Regras**: CRUD de `form_scoring_rules` globais (sem `form_id`) — condição (campo/operador/valor), delta, tag, temperatura, ação.
- **Aba Temperatura**: faixas hot/warm/cold com preview.
- **Aba Distribuição**: pool de vendedores (busca membros da company), toggle disponibilidade, slider performance, estratégia global, fallback.

Server functions autenticadas com `requireSupabaseAuth` para escrita; leitura via TanStack Query.

## 6. Melhorias na página de leads

- Coluna "Atribuído a" com avatar do vendedor.
- Filtro por `assigned_to` (todos / meus leads / não atribuídos).
- Ação bulk: reatribuir manualmente.

## Detalhes técnicos

- Avaliação de `condition` JSONB: `{ field: 'phone', op: 'exists' }`, `{ field: 'orcamento', op: 'gte', value: 500000 }`. Parser puro em TS testável.
- Round-robin thread-safe: `UPDATE ... RETURNING` com `FOR UPDATE SKIP LOCKED` via RPC `pick_next_routing_member(config_id)` — evita corrida em picos.
- Todas as escritas de scoring/routing rodam via `createServerFn` (service-role para bypass RLS quando o lead vem de webhook público).

## Fora do escopo

- ML/scoring por IA (fica para fase seguinte usando Lovable AI).
- SLA e reassignment por inatividade.
- Notificação push ao vendedor (WhatsApp Cloud é a próxima fase).

## Ordem de entrega

1. Migration (aguarda aprovação).
2. RPC `pick_next_routing_member` + engines TS.
3. Wire nos 3 pontos de captura.
4. UI settings/routing.
5. Página de leads com "assigned_to".
