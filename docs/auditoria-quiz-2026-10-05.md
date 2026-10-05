# Auditoria do módulo de Quiz — cases, construtor e plano

Data: 05/10/2026. Base medida: commit `88527e8` em produção.

> Tudo abaixo separa o que foi **medido** (com a fonte nomeada) do que é
> **conclusão minha**. Nada aqui é dedução apresentada como fato.

---

## Parte 1 — Os três cases

### 1.1 `plano-pronto.isack.com.br` — quiz de qualificação → oferta low-ticket

Percorri o funil inteiro (13 telas) e registrei a mecânica.

**Medido:**

| Recurso | Como aparece |
|---|---|
| Avanço automático | Clicar na opção avança. Sem botão "Continuar" em pergunta de escolha única |
| Barra de progresso + voltar | Aparecem **só a partir da 2ª tela**. A 1ª é limpa, sem indicação de que há um funil |
| Destaque na pergunta | Palavra-chave com marca-texto amarelo em **todas** as perguntas |
| Emoji por opção | 🏬 🛠️ 🧑‍💼 📦, e emojis de emoção (😰 😞 😕) nas perguntas de dor |
| Sub-rótulo | "(varejo, restaurantes, comércios, etc.)" abaixo do rótulo |
| Layout 2 colunas | Resposta binária (SIM/NÃO) fica lado a lado, não empilhada |
| Múltipla escolha | Checkbox + "Continuar →", separada visualmente da escolha única |
| Prova social na abertura | Foto do autor + "dono de 4 empresas, 16 anos", 5 avatares, "80% … 42% no primeiro mês" |
| **Tela de resultado** | **"📊 Grau de Visibilidade: 19 (máx. 100)"** + gráfico Antes/HOJE/Depois comparando "Você" × "Concorrentes" |
| Largura | 454px — desenhado para celular, não adaptado |

**Conclusão minha:** o ativo de conversão desse funil é a **nota baixa com gráfico
comparativo**. Ele não entrega diagnóstico, entrega um *gap* visível entre onde
a pessoa está e onde os concorrentes estão. O nosso quiz calcula a nota e a
guarda — nunca a mostra assim.

### 1.2 `quizz.guisalezze.com` — quiz gamificado

**Medido** (interceptei `new Audio` e `HTMLMediaElement.play` na página):

```
audio/notificacao_venda.mp3     ← som de venda
audio/background_sound.mp3      ← trilha de fundo
etapa1.mp4                      ← VSL vertical por etapa, legenda queimada
```

| Recurso | Como aparece |
|---|---|
| Contador "💰 Vendas ao vivo" | Fixo no topo. Começou em **R$ 0,00** e foi para **R$ 37,00** no primeiro clique |
| "Você teria ganhado seguindo a estrutura" | Segunda linha, reforçando o ganho acumulado |
| "🔓 CONQUISTA DESBLOQUEADA" | Modal com borda dourada entre etapas |
| Pilha de notificações | Prints animados de "Venda realizada (Pix) — Sua comissão R$ 28,47" |
| Vídeo por etapa | Vertical, autoplay, sem controles; o botão aparece depois de X segundos |
| Tema | Escuro + verde neon + dourado |

**Conclusão minha:** o mecanismo central é o **contador que sobe a cada
resposta**, com som a cada incremento. É a tradução literal do "som de compra /
dinheiro" que você pediu. O conteúdo da pergunta importa menos que a sensação
de estar ganhando algo ao responder.

### 1.3 `inlead.digital` — o concorrente de plataforma

**Medido** (página de planos e FAQ):

- BASIC R$97/mês — 2 funis, 5 mil leads · PRO R$197 — 5 funis, 10 mil · ELITE R$297 — 10 funis, 25 mil
- Todos os planos: webhook, **edição compartilhada**, componentes interativos,
  **domínio próprio**, pixel e scripts, gestão e download dos leads
- Posicionamento: "pioneira no Brasil", "+2x retenção", "+40% conversão", "76 milhões de leads"
- Construtor: arrastar e soltar, sistema de blocos

**Onde nós já estamos iguais ou à frente:** blocos arrasta-e-solta, componentes
interativos, pixel/CAPI, download de leads, LGPD, **teste A/B com promoção de
variante** (o inlead não anuncia isso), automação, CRM embutido.

**Onde eles têm e nós não:** domínio próprio por funil, edição compartilhada
(dois editores ao mesmo tempo), biblioteca pública de modelos.

---

## Parte 2 — Auditoria do construtor e do player

`npx tsc --noEmit` → **0 erros**. Os defeitos abaixo são de lógica, não de tipo.

### 🔴 Graves

**1. `maxPossibleScore` conta pontos que o visitante não pode alcançar**
`src/modules/quiz/engine.ts` percorre `schema.blocks` inteiro, incluindo blocos
ocultos por `showIf`.

Medido no quiz `diagnostico-beleza-natural` em produção:

```
blocos pontuáveis:            20
desses, condicionais:          6
```

Como 6 dos 20 só aparecem para parte dos visitantes, o denominador embute pontos
inalcançáveis. O percentual sai **sistematicamente menor** que o real e o lead cai
numa faixa mais baixa — e é a faixa que decide **qual mensagem de WhatsApp é
enviada** (`/api/public/quiz-completed`). O comentário no próprio arquivo registra
que esse cálculo já foi corrigido uma vez por errar na direção oposta.

**2. Etapa final totalmente oculta trava o visitante numa tela em branco**
`QuizPlayer.tsx:285-290`:

```ts
while (idx < steps.length && !stepHasVisibleBlocks(idx, state.responses)) idx += 1;
if (idx < steps.length) setState(...)   // ← se a última etapa está oculta, não faz nada
```

Se a condição esconder todos os blocos da última etapa, o laço chega em
`steps.length`, o `if` é falso e o player **fica parado numa etapa sem nada para
renderizar**: sem bloco, sem botão, sem tela de conclusão.

**3. Publicar não valida nada**
Não existe checagem antes de `handlePublish`. É possível publicar um quiz **sem
nenhum bloco de captura** (`email`/`phone`/`form`) — ele roda, pontua, grava
submissão e **nunca gera lead**. Foi exatamente esse o sintoma que custou esta
semana inteira de depuração.

**4. Sair da página sem salvar não avisa**
`grep beforeunload` → 0 ocorrências. Com o autosave desligado, fechar a aba
descarta o trabalho sem nenhum aviso.

### 🟠 Médias

**5. Desfazer a exclusão de um bloco quebra a etapa**
`builder.tsx`, ação "Desfazer": o bloco volta como **etapa nova** com um único
componente, em vez de voltar à etapa de onde saiu, na posição de onde saiu. Uma
tela com 3 componentes vira duas telas. O mesmo trecho chama `getSteps(...)` sem
`keepEmpty`, então o desfazer também apaga etapas vazias que existiam.

**6. `removeChildFromContainer` pode zerar o agrupamento de etapas**
É o único ponto do arquivo que usa `prev.steps ?? []` em vez de
`getSteps(prev, { keepEmpty: true })`. Num quiz legado sem `steps` gravado, o
`?? []` vira lista vazia e o resultado é uma etapa só.

**7. Autosave não tenta de novo depois de falhar**
O efeito depende de `[schema, dirty, autosave, loading]`. Falhou o `handleSave`,
`dirty` continua `true` e nada mais muda — **nenhuma nova tentativa até a próxima
edição**. O indicador fica vermelho, mas se a pessoa parar de editar, o trabalho
fica só na aba.

**8. `evaluateLogic` não implementa `gte`, `lte` nem `between`**
`BlockLogicOp` só tem `'eq' | 'neq' | 'contains' | 'gt' | 'lt'`, enquanto
`isBlockVisible` suporta os sete. Regras de salto são menos expressivas que
regras de exibição, sem motivo técnico.

**9. `logicRules` não é editável em lugar nenhum**
`grep logicRules QuizInspector.tsx` → **0**. A função `evaluateLogic` existe, é
chamada pelo player, e **nenhuma interface escreve essas regras**. O único desvio
configurável é o `jumpToBlockId` por opção.

**10. Geolocalização por terceiro, sem consentimento**
`QuizPlayer.tsx` chama `https://ipapi.co/json/` em toda carga pública. Isso envia
o IP do visitante a um terceiro antes de qualquer aceite. No meu teste a chamada
voltou **bloqueada** (`status 0`), ou seja, além da questão de LGPD o dado
frequentemente nem chega.

### 🟡 Menores

- Pontuação pode ficar **negativa**: `evaluateResponse` soma scores negativos, mas `maxPossibleScore` usa `Math.max(0, …)`. Percentual negativo não é tratado.
- `QuizPlayer.tsx` com **2.284 linhas** e `QuizInspector.tsx` com **2.246**. Qualquer mudança nesses dois arquivos é de alto risco.
- Progresso não é persistido: recarregar a página perde todas as respostas, e a recuperação de abandono não tem como retomar de onde parou.

---

## Parte 3 — Plano de melhorias

### Onda 1 — Fechar os buracos (antes de qualquer recurso novo)

| # | O quê | Onde |
|---|---|---|
| 1 | `maxPossibleScore` passa a receber as respostas e ignorar blocos invisíveis; o servidor recalcula o máximo pelo caminho realmente percorrido | `engine.ts`, `quiz-completed.ts` |
| 2 | Última etapa oculta → encerra o quiz em vez de travar | `QuizPlayer.tsx` |
| 3 | Validação ao publicar: sem bloco de captura, sem etapa, ou faixa sem mensagem → aviso bloqueante com o motivo | `builder.tsx` |
| 4 | `beforeunload` quando há alteração não salva | `builder.tsx` |
| 5 | Desfazer devolve o bloco à etapa e à posição originais | `builder.tsx` |
| 6 | Autosave com nova tentativa em recuo exponencial após falha | `builder.tsx` |
| 7 | `gte`/`lte`/`between` em `evaluateLogic` + editor de `logicRules` no inspector | `engine.ts`, `QuizInspector.tsx` |
| 8 | Geo sai do navegador: resolver no servidor pelo IP da requisição, respeitando o consentimento | `QuizPlayer.tsx`, rota pública |

### Onda 2 — Gatilhos e som (o que você pediu)

**Som.** Um `SoundSettings` no schema do quiz, com os arquivos hospedados no
nosso MinIO e **tudo desligado por padrão**:

| Gatilho | Som sugerido |
|---|---|
| Resposta registrada | clique curto |
| Avanço de etapa | *whoosh* |
| Conquista desbloqueada | fanfarra curta |
| Contador de dinheiro subindo | **caixa registradora / moeda** |
| Notificação de venda | **som de notificação de venda** (o case 1.2 usa exatamente isto) |
| Conclusão | aplauso / sucesso |
| Trilha de fundo | laço em volume baixo |

Regras que precisam estar no código desde o primeiro commit, senão viram defeito:
- Navegador **bloqueia áudio antes do primeiro toque** — o player só arma os sons depois da primeira interação.
- **Botão de mudo sempre visível** e a escolha guardada por visitante.
- Respeitar `prefers-reduced-motion` para as animações que acompanham o som.
- Pré-carregar o som da etapa seguinte, senão ele chega atrasado.

**Gamificação.** Três blocos novos:
1. **Contador acumulado** (`money-counter`) — sobe a cada resposta, valor por opção configurável, formato em R$ ou em pontos, com animação de contagem e som.
2. **Conquista** (`achievement`) — modal entre etapas, com ícone, título e botão. É o "🔓 CONQUISTA DESBLOQUEADA" do case 1.2.
3. **Comparativo Antes/Depois** (`score-gauge`) — a nota do visitante + a curva "você × concorrentes". É o "Grau de Visibilidade" do case 1.1, e é o recurso que mais nos falta.

**Outros gatilhos:**
- Saída por intenção (*exit intent*) com oferta de retomar depois
- Confete / vibração na conclusão
- Barra de progresso que só aparece a partir da 2ª etapa (padrão dos dois cases)
- Botão voltar no player — **os dois cases têm, nós não**

### Onda 3 — Autoria

- **Destaque na pergunta**: marca-texto por palavra no editor (todos os cases usam em 100% das perguntas)
- **Emoji e sub-rótulo por opção** como campo de primeira classe
- **Layout 2 colunas** para resposta binária
- Retomada de progresso (`sessionStorage` + chave de sessão) ligada à recuperação de abandono que já existe
- Quebrar `QuizPlayer` e `QuizInspector` em arquivos por família de bloco

### Onda 4 — Paridade de plataforma

- Domínio próprio por funil
- Edição compartilhada
- Biblioteca pública de modelos a partir dos `STEP_TEMPLATES` que já existem

---

## Ordem sugerida

Onda 1 primeiro, inteira. **Conclusão minha:** recurso novo sobre uma nota
calculada errada e uma publicação sem validação multiplica o problema em vez de
resolver — cada quiz novo publicado sem bloco de captura é mais uma semana de
depuração como a desta semana.
