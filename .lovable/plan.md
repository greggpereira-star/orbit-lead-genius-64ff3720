# Plano — Alt Quiz (construtor premium de quizzes)

Este é um escopo grande demais para uma única entrega. Proponho quebrar em **5 fases entregáveis**, cada uma testável e utilizável em produção antes da próxima. Cada fase termina em um app funcional — nada de "meio pronto".

## Fase 1 — Fundação (módulo + banco + rotas)

- Novo módulo `src/modules/quiz/` seguindo padrão do `capture/`.
- Menu "Alt Quiz" e rotas: `/quizzes`, `/quizzes/new`, `/quizzes/$id/builder`, `/preview`, `/publish`, `/performance`.
- Página lista com status, nicho, leads, conclusão, conversão, estado vazio, botões Criar/Template.
- Tabelas: `quiz_funnels`, `quiz_versions`, `quiz_blocks` (opcional se schema em version), `quiz_submissions`, `quiz_events`, `quiz_media`, `quiz_results`, `quiz_templates`. RLS por `company_id`, GRANTs, triggers `updated_at`.
- Reuso de `leads`, `lead_events`, `integration_jobs`, `cvcrm_delivery_logs`, `conversion_event_logs`.

## Fase 2 — Builder visual + Design System

- Layout 3 colunas (blocos / editor / preview live).
- Abas: Conteúdo, Design, Lógica, Resultado, Captura, Integrações, Publicação.
- Blocos: Intro, Single/Multiple/Picture Choice, Text/Email/Phone/Name/Number, Scale, Date, Statement, Testimonial, Result, Lead Capture, CTA. (Vídeo/Áudio/Antes-Depois entram na Fase 3.)
- Aba Design: cores, fontes, radius, sombra, logo, background image, layout mode (fullscreen/card/split/story/inline/modal), 9 presets.
- Aba Identidade Visual (subconjunto Design aplicado global).
- Preview live mobile/tablet/desktop com hot reload do schema.

## Fase 3 — Mídia rica + Antes/Depois + Som

- Bucket `quiz-media` (privado com signed URLs por padrão) + tabela `quiz_media` com url, type, size, dims, duration, thumb, alt.
- Upload com compressão de imagem no cliente, thumbnails, lazy load, validação de tamanho, aviso de mídia pesada.
- Bloco Video Question, Audio Question, Before/After (slider, lado-a-lado, galeria, card).
- Música de fundo e sons de interação (mudo por padrão no mobile, controle visível).
- Disclaimer opcional para saúde/estética.

## Fase 4 — Lógica, Score, Resultados, Captura, Player público

- Motor de score/tags/temperatura configurável por resposta.
- Lógica condicional (operadores igual/diferente/contém/>,</entre; ações ir-para/tag/resultado).
- Editor de resultados (título, mídia, CTA WhatsApp/link, PDF, score range, condições).
- Captura de lead com posição configurável, LGPD (consentimento + versão).
- **Player público separado** (bundle enxuto) em `/q/$slug` — fullscreen/card/split/story/inline/modal.
- Edge Function `public-quiz-submit`: resolve slug → versão publicada → valida → score → resultado → cria/atualiza lead → salva submission/events → enfileira integrações → retorna rápido.
- Skeleton, preload primeira tela, sem tela branca, fallback de mídia.

## Fase 5 — Publicação, Integrações, Analytics, Templates

- Publicação: link, iframe, inline script, modal trigger, floating button, shortcode WP.
- SDK `quiz-sdk.js` (mínimo) para embed/modal/floating.
- CRM interno + CV.CRM (fila via `integration_jobs`, nunca bloqueia submit).
- Meta CAPI e Google Enhanced Conversions (eventos QuizView/Start/Lead/Qualified/Completed/ResultViewed) com fbp/fbc/gclid/hash.
- Aba Performance: views, start, conclusão, leads, conversão, drop-off por bloco, resultado mais comum, temperatura, UTM, device.
- 6 templates premium com placeholders neutros.

## Detalhes técnicos

- Stack: TanStack Start (server fns em `src/lib/quiz.functions.ts`, `requireSupabaseAuth`), player em rota pública top-level (não `_authenticated`), submit via server route `src/routes/api/public/quiz-submit.ts` com validação Zod.
- Schema versionado JSON em `quiz_versions.schema` (jsonb) — reduz churn de tabelas; `quiz_blocks` só se precisarmos consultar bloco a bloco.
- RLS: policies por `company_id` via `has_company_access(auth.uid(), company_id)`; leitura pública apenas de `quiz_versions.published=true` via anon SELECT restrita a colunas seguras.
- Storage: bucket privado + signed URLs de 24h no player; upload por Edge Function que valida `company_id`.
- Performance: player em chunk separado (`/q/*` route splitting), sem imports do builder; Suspense + skeleton; imagens `loading="lazy"` + `srcset`.
- Integrações: `integration_jobs` com `trace_id`, retry exponencial, worker cron; falha externa nunca afeta resposta do submit.

## Como quer prosseguir?

1. **Aprovar Fase 1** e eu já executo (migration + módulo + rotas + lista vazia) — provavelmente 1 turno.
2. **Ajustar o escopo** de alguma fase antes.
3. **Priorizar diferente** (ex.: player público antes do builder completo).

Qual caminho?
