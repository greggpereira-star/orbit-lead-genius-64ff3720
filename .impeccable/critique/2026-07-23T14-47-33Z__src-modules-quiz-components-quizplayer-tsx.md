---
target: QuizPlayer.tsx (Alt Quiz player publico)
total_score: 12
max_score: 32
na_heuristics: 7,10
p0_count: 2
p1_count: 3
timestamp: 2026-07-23T14-47-33Z
slug: src-modules-quiz-components-quizplayer-tsx
---
Method: dual-agent (A: a7654b28a22d25ef5 · B: ab5ad6d1943d25a84)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | `saving` só desabilita o botão, sem spinner/label — envio invisível |
| 2 | Match System / Real World | 1 | Jargão de CRM vaza pro visitante: "❄️ Lead frio" no resultado |
| 3 | User Control and Freedom | 1 | Sem botão Voltar; single-choice e loading auto-avançam sem desfazer |
| 4 | Consistency and Standards | 2 | Player ignora `progressStyle` dots/steps (só desenha barra); Builder respeita |
| 5 | Error Prevention | 1 | Auto-avanço permite misclick irreversível; email só valida length>0 |
| 6 | Recognition Rather Than Recall | 2 | Inputs usam placeholder como label — some ao digitar |
| 7 | Flexibility and Efficiency | n/a | Superfície de captura linear, não se aplica |
| 8 | Aesthetic and Minimalist Design | 2 | Limpo, mas toast de prova social + barra de urgência competem por atenção |
| 9 | Error Recovery | 1 | Nenhuma mensagem de erro; falha de submissão não tem feedback de UI |
| 10 | Help and Documentation | n/a | Não aplicável a quiz de captura |
| **Total** | | **12/32** | **Poor (37.5%)** |

## Design Specificity Verdict

**LLM assessment**: Genérica e trocável. A composição é 100% token-driven — trocar `primary/background/surface` faz o mesmo JSX virar qualquer produto. Não há motivo de marca, ilustração autoral ou layout distinto entre os 9 presets. O agravante: todos os 9 presets usam `fontHeading: 'Inter'` e `fontBody: 'Inter'` (design-presets.ts) — "Rose Luxe" (estética/alto ticket) e "Gold" (luxo) têm a mesma voz tipográfica de "Mono" ou "Candy". A largura fixa de 448px em qualquer viewport deixa o desktop com um cartão estreito flutuando em vazio.

**Deterministic scan**: `detect.mjs` retornou `[]` (zero achados) nos 4 arquivos alvo — o detector automático não pega problemas de tipografia morta, contraste calculado ou ausência de ARIA; essas são as vulnerabilidades que a auditoria manual (Assessment B) capturou por cálculo/grep direto. Nenhum falso positivo a reportar (não há achados do detector).

## Overall Impression

O Alt Quiz tem cobertura de blocos ampla (27 tipos) e uma arquitetura de temas coerente no papel, mas a experiência final entrega "funcional" em vez de "confiável/premium". A maior oportunidade única: o sistema de tokens promete personalidade (9 presets, incluindo "luxo" e "alto ticket") mas nunca aplica tipografia diferenciada, e o momento de maior conversão (a tela de resultado) tem um botão de CTA sem `onClick` e expõe a classificação interna do lead ("frio") — exatamente o oposto de "passar autoridade e confiança".

## What's Working

1. **Cobertura de blocos ampla e coerente** entre player e preview (28 tipos) — dá ao cliente paridade real de recursos com o Funilix.
2. **Opções de escolha são `<button>` semânticos**, não `div`s — boa base de acessibilidade para navegação por teclado.
3. **Auto-avanço em `single-choice`** reduz atrito e cliques, especialmente valioso em mobile quando o usuário acerta de primeira.

## Priority Issues

**[P0] CTA de resultado morto** — `QuizPlayer.tsx` (`ResultView`): o `<PrimaryBtn>` final não tem `onClick`. O clique de maior intenção de conversão não faz nada.
**Why it matters**: é o momento pico da jornada (regra pico-fim) — o lead completou o quiz, está mais engajado, e o botão não responde.
**Fix**: conectar `resultBlock.ctaUrl`/ação (WhatsApp, checkout, redirecionamento) ao clique.
**Suggested command**: `/impeccable harden`

**[P0] Jargão de CRM exposto ao lead** — `QuizPlayer.tsx` `ResultView`: mostra "❄️ Lead frio / ⚡ Lead morno / 🔥 Lead quente" diretamente pro visitante.
**Why it matters**: informa o usuário que ele foi classificado como "frio"/desqualificado — desmotiva e quebra confiança justo no fechamento.
**Fix**: substituir por mensagem orientada a benefício por faixa de score (configurável no Builder), nunca a temperatura interna.
**Suggested command**: `/impeccable clarify`

**[P1] Tipografia idêntica em todos os 9 presets** — `design-presets.ts`: `fontHeading`/`fontBody` sempre `'Inter'`; `QuizPlayer.tsx`/`QuizPreview.tsx` nunca leem esses campos (0 ocorrências).
**Why it matters**: é a única alavanca de personalidade tipográfica do sistema e está morta — presets "Rose Luxe"/"Gold"/"Mono" ficam indistinguíveis tipograficamente, aumentando a sensação de genérico vs. o visual autoral do Funilix.
**Fix**: aplicar `fontFamily` real via `style`/Google Fonts por preset, com pelo menos uma fonte serifada/display pros presets premium.
**Suggested command**: `/impeccable typeset`

**[P1] Sem foco de teclado, labels ou ARIA em toda a superfície de captura** — inputs com `outline-none` sem substituto; nenhum `<label>`; progress bar e opções sem ARIA.
**Why it matters**: falha WCAG AA (1.3.1, 2.4.7, 4.1.2) e torna o funil de captura de lead inacessível a usuários de leitor de tela/teclado.
**Fix**: `:focus-visible` com anel em `design.primary`, `<label>` associado a cada input, `role="progressbar"` com `aria-valuenow`, `aria-pressed` nas opções.
**Suggested command**: `/impeccable harden`

**[P1] Contraste do CTA falha em 5 dos 9 presets** — texto branco fixo sobre `design.primary` em botão solid/gradient; calculado abaixo de 4.5:1 em sunset, emerald, ocean, candy e aurora.
**Why it matters**: o botão principal de avanço fica difícil de ler para usuários com baixa visão em mais da metade dos temas disponíveis.
**Fix**: calcular contraste do texto do botão dinamicamente (branco vs. escuro) por preset, ou ajustar os tons de `primary`.
**Suggested command**: `/impeccable colorize`

## Persona Red Flags

**Casey (Distracted Mobile User)**: auto-avanço em `single-choice` + zero botão Voltar = um toque errado no scroll avança sem retorno possível. Barra de urgência sticky + toast de prova social ocupam topo e base numa tela de 375px, espremendo o conteúdo real do quiz.

**Sam (Accessibility-Dependent User)**: `outline-none` global elimina foco visível; inputs sem `<label>` (leitor de tela anuncia só o placeholder, que desaparece ao digitar); `multi-choice` sem `aria-pressed`; `alt=""` em imagens de conteúdo (intro/carrossel) as torna invisíveis pro leitor de tela; contraste de `muted` sobre `surface` já falha antes mesmo de aplicar `opacity-80` extra (candy: 2.54:1).

## Minor Observations

- Subtítulo aplica `opacity-80` **e** `color: muted` simultaneamente — escurecimento duplo, texto quase some em alguns presets.
- `custom` (bloco HTML livre) usa `dangerouslySetInnerHTML` sem sanitização — risco de segurança, não só de design.
- `comparison` usa `text-red-400` fixo no Tailwind, fora do sistema de tokens — destoa em presets claros como Candy/Minimal Light.
- Zero `loading="lazy"` em qualquer `<img>`, incluindo o carrossel que pode carregar várias imagens fora da viewport de uma vez.
- Dois switch-statements paralelos (BlockView + BlockRenderer) para os mesmos ~27 tipos — manutenção manual sincronizada, risco de deriva visual entre Builder e Player (já existe pro `progressStyle`).

## Questions to Consider

- Se removêssemos as cores dos 9 presets, algum lead conseguiria dizer que esse quiz específico é diferente de qualquer outro concorrente? Se não, onde mora a "autoridade"?
- Por que ter 9 presets de cor e zero personalidade tipográfica — o que diferencia "Rose Luxe" de "Ocean" além do matiz?
- O momento de maior conversão (o resultado) tem a nota mais fria e o botão menos funcional do fluxo inteiro — por que o ponto mais importante é o menos acabado?
