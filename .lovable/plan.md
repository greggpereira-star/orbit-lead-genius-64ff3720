# Fase: Quiz/Formulário Público Polido

Objetivo: transformar o Quiz Builder atual em ferramenta de produção — com templates prontos, upload de mídia real, publicação em slug custom e preview mobile fiel.

## Escopo

### 1. Templates prontos
- 4 templates seed em `src/modules/quiz/templates/`:
  - **Lead Imobiliário** (perfil de compra + faixa de renda + região)
  - **Consultoria Financeira** (objetivo + patrimônio + horizonte)
  - **Fitness/Saúde** (objetivo + rotina + restrições)
  - **Genérico Captura** (nome, e-mail, telefone, pergunta livre)
- Cada template define: passos, campos, cores, textos de CTA e página de agradecimento.
- Nova tela `/quizzes/new` com galeria de templates + opção "Em branco".

### 2. Upload de mídia
- Bucket Supabase `quiz-media` (público, com RLS por `owner_id`).
- Componente `MediaUploader` no builder para imagem/vídeo por passo.
- Suporte no `BeforeAfterSlider` para upload direto (antes/depois).
- Otimização: limite 5MB imagem / 20MB vídeo, formatos aceitos validados client-side.

### 3. Publicação
- Campo `slug` editável em `quiz_funnels` com validação de unicidade.
- Botão "Publicar" alterna `status: draft → published` e gera URL final:
  `https://<domínio>/q/<slug>`.
- Card com URL + copy button + QR code no builder.
- Toggle "Requer confirmação de e-mail" (opcional, off por padrão).

### 4. Preview mobile fiel
- Aba "Preview" no builder com toggle Desktop/Mobile/Tablet.
- Iframe carregando `/q/<slug>?preview=true` em viewport fixo (375x812 mobile, 768x1024 tablet).
- Refresh automático ao salvar alterações.

## Arquivos afetados

```text
src/modules/quiz/
├── templates/              (novo — 4 templates)
│   ├── index.ts
│   ├── real-estate.ts
│   ├── finance.ts
│   ├── fitness.ts
│   └── generic-capture.ts
├── components/
│   ├── MediaUploader.tsx           (novo)
│   ├── PublishCard.tsx             (novo)
│   └── DevicePreview.tsx           (novo)
└── services/
    └── mediaService.ts             (novo — upload/list/delete)

src/routes/
├── _app.quizzes.new.tsx            (novo — galeria de templates)
├── _app.quizzes.$id.builder.tsx    (ajustes: preview tab + publish card)
└── q.$slug.tsx                     (respeitar ?preview=true)
```

## Migração de banco

- Bucket `quiz-media` com policies:
  - INSERT/DELETE: apenas dono do quiz correspondente.
  - SELECT: público (mídia servida no quiz final).
- Constraint `UNIQUE` em `quiz_funnels.slug`.
- Coluna `published_at TIMESTAMPTZ` em `quiz_funnels`.

## Fora de escopo (fica pra próxima fase)
- A/B testing entre variantes.
- Editor de tema avançado (fontes custom, CSS livre).
- Analytics detalhado por passo (já parcialmente coberto em `performance.tsx`).

Aprovar para eu executar?
