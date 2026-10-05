# Estado real da paridade — o que falta e o que não foi testado

Levantado em 05/10/2026 por verificação no código, não de memória.

---

## 1. Não, não implementamos tudo

### Entregue

| § | Recurso |
|---|---|
| 1 | Aba Design como rota própria |
| 2 | Identidade do funil: logo, cor de título separada, tamanhos, altura de elemento, largura, alinhamento vertical, cores guardadas, conta-gotas |
| 3 | Posicionamento fora do fluxo: topo fixo, rodapé fixo, flutuante (8 cantos), tela inteira |
| 4 | Agendamento, Gráfico configurável (5 tipos), Preço com moeda, Máscara de campo |
| 5 | Lógica por resposta, quantidade, porcentagem e pontuação + editor de regras + `gte`/`lte`/`between` |
| 6 | Nota de conversão por etapa; aba de Análise determinística |
| 7 | Trava de edição com pedido de controle |
| 9 | Duplicar etapa, arquivar/desarquivar |

### Mapeado e **não** implementado

Verificado por busca no código — nenhum destes existe:

| § | Recurso | Observação |
|---|---|---|
| 1 | Aba **Resultados** própria | as faixas seguem dentro de Configurações |
| 1 | Aba **Respostas** separada de Performance | — |
| 2 | **`Herdar do tema`** por bloco | o bloco não sabe voltar ao tema |
| 2 | **Design por etapa** (`step.design`) | no inlead a etapa sobrescreve o funil |
| 2 | `Cores do documento` (cores já usadas no funil) | só há as cores guardadas à mão |
| 3 | **Painel de camadas** | a lista de blocos da etapa não é um painel de camadas |
| 3 | `Encaixe` (snap) | — |
| 4 | **Script `onClick` por bloco** | existe `custom` com HTML, não script por bloco |
| 4 | Itens de paleta: Grade, Cards, Sumário, Indicador, Seta, Emoji, Marca/Logo, Redes sociais | — |
| 6 | **`Melhor horário`** e **`Melhor origem`** | são as respostas de negócio já prontas |
| 6 | `Taxa de rejeição`, `Tempo médio`, `Média de etapas concluídas`, `Profundidade média` | — |
| 8 | **Camada de IA** (análise redigida e Editar com IA) | bloqueada: sem chave no servidor |
| 9 | `Exportar leads` com link de validade | — |
| 9 | `Resetar dados` | — |
| 9 | Passo a passo guiado no primeiro uso | — |
| 9 | `Auto-organizar` no Fluxo | — |
| 9 | Biblioteca pública de modelos | os `STEP_TEMPLATES` existem, a galeria não |
| 9 | Rodapé "Criado via" com UTM de indicação | — |

**Decisão consciente, não esquecimento:** arrastar-para-qualquer-ponto (posição
absoluta livre). Num funil lido no celular quebra mais do que resolve, e o
`Container` já cobre grade, colunas e alinhamento com sobrescrita por breakpoint.

---

## 2. Não, nem tudo foi testado

O motivo é estrutural: **o construtor fica atrás de login e eu não tive sessão
autenticada em nenhum momento.** Tudo que é público foi exercitado no navegador;
quase nada do painel foi.

### Exercitado no navegador, em produção

- Botão voltar, com resposta preservada ao voltar
- Agendamento (calendário, dias bloqueados, horários, confirmação)
- Gráfico de área (eixos, grade, rótulos, dica)
- Preço com moeda e hierarquia de tamanho
- Máscara de telefone, digitando
- Grade de 2 colunas
- Posicionamento: topo fixo e flutuante, com medição de largura e distância
- Beco sem saída da etapa final oculta (lead gravado no fim)
- Quiz da cliente, sem regressão, após cada deploy

### Passada de verificação com sessão autenticada — 05/10, 12h

Feita no Chrome do usuário, sobre o quiz de teste arquivado `teste-onda-4`.

**Dois defeitos encontrados e corrigidos (`e180e3d`):**

1. 🔴 **Aba Design estourava inteira** — "Cannot read properties of null
   (reading 'store')". O `QuizPreview` tem um `Droppable` dentro e exige um
   `DragDropContext` acima; o construtor tem um, a rota nova não tinha.
2. 🟠 **Nome de etapa cortado em ~10 caracteres** ("Telefone ...", "Grade 2 ...",
   "Agenda..."), impossível distinguir uma etapa da outra. Nome e descrição do
   bloco disputavam uma linha com quatro ícones num painel de 240px.

**Verificado funcionando:**

- Aba Design completa, com troca de cor propagando ao vivo e autosave gravando
- Aba Análise: achou "Nenhuma etapa de captura identificada" e "2 conclusões
  geraram só 0 leads" — ambos corretos para aquele quiz
- Validação ao publicar: **bloqueou** com a mensagem certa
- Contagem de visitantes por etapa na lista (4👤, 3👤, 2👤)
- Editor de regras de salto, com os quatro modos
- Seção "Posição na tela" com as cinco opções
- Trava de edição: segunda aba mostrou "Edição em uso por gregg.pereira"
- Arquivar: filtro "Mostrar arquivados (3)" e selo "Arquivado"
- Botão duplicar etapa presente na linha

**Ainda não verificado:** cartão com foto nas opções (nenhum quiz de teste usa
imagem), aviso ao sair sem salvar, e o fluxo de pedir/assumir controle além do
aviso inicial.

**Achado novo, não corrigido:** o cartão do quiz na lista mostra **100%
Conclusão** enquanto a Análise calcula **12%** para o mesmo funil. São
denominadores diferentes (`getListStats` usa submissões, a Análise usa `start`),
mas o usuário vê dois números contraditórios na mesma sessão.

**Armadilha de produto, não corrigida:** um `Texto curto` com máscara de telefone
**não** conta como captura — `extrairContato` procura por TIPO de bloco. Quem
mascarar um campo de texto como telefone não vai gerar lead nenhum, e hoje nada
avisa isso no construtor. A validação ao publicar pega o caso, mas só na hora de
publicar.

### **Nunca aberto** numa tela

| O quê | O que existe de verificação |
|---|---|
| Aba **Design** inteira | compila; nenhuma propriedade foi ajustada na interface |
| **Nota de conversão** no construtor e na Performance | cálculo testado em unidade e contra dados reais; a tela, não |
| **Faixa da trava de edição** | as 5 transições testadas no banco; o aviso visual, não |
| **Editor de regras de salto** | motor testado em 8 casos; o editor, não |
| **Validação ao publicar** | validador testado em 4 casos; o aviso na tela, não |
| **Aba de Análise** | analisador rodado contra o quiz real; a tela, não |
| **Duplicar etapa** e **arquivar** pelo botão | arquivei por SQL, não pelo botão |
| **Cartão com foto** nas opções | nenhum quiz de teste usou imagem |
| Aviso ao sair sem salvar | — |

Não há suíte automatizada que cubra isso: `tests/e2e/` tem **um** arquivo, de
autenticação, e **nada** cobre o quiz.

---

## 3. Sim, ainda há falhas conhecidas

Da auditoria de 05/10, confirmadas ainda presentes no código:

| Gravidade | Falha | Onde |
|---|---|---|
| 🟠 | **Desfazer a exclusão de um bloco** devolve ele como etapa NOVA, partindo uma tela de 3 componentes em duas. O mesmo trecho chama `getSteps` sem `keepEmpty` e apaga etapas vazias | `builder.tsx:398-401` |
| 🟠 | **`removeChildFromContainer`** usa `prev.steps ?? []` em vez de `getSteps(..., {keepEmpty:true})`; num quiz legado sem `steps` gravado, zera o agrupamento | `builder.tsx` |
| 🟠 | **Autosave não tenta de novo** depois de falhar: `dirty` continua `true`, nada muda nas dependências, e sem nova edição o trabalho fica só na aba | `builder.tsx` |
| 🟠 | **Geolocalização por terceiro** (`ipapi.co`) a cada carga pública, antes de qualquer aceite — e no teste voltou bloqueada | `QuizPlayer.tsx` |
| 🟡 | Pontuação pode ficar **negativa**; o máximo usa `Math.max(0, …)` e o percentual negativo não é tratado | `engine.ts` |
| 🟡 | **Progresso não é persistido**: recarregar perde tudo, e a recuperação de abandono não retoma | `QuizPlayer.tsx` |
| 🟡 | Arquivos grandes, e **pioraram** nesta semana: `QuizPlayer` 2.284 → **2.666**, `QuizInspector` 2.246 → **2.725**, `builder` 1.156 → **1.359** | — |

### Falhas introduzidas e corrigidas nesta semana

Vale registrar, porque mostram o padrão: **compilar não é funcionar**. Todas
passaram por `tsc` e `vite build` sem ruído e só apareceram ao abrir a página.

- Cor do título herdando errado (variável CSS com padrão indevido)
- Calendário sem folha de estilo
- Gráfico sem eixos (recharts não lê filhos dentro de Fragment)
- Preço com prefixo do mesmo tamanho do valor
- Barra fixa cobrindo o título
- **Laço infinito de renderização** (React #185) — chegou a produção e exigiu
  reversão

---

## Recomendação

Antes de abrir mais frentes, duas coisas:

1. **Uma passada de verificação no construtor com sessão autenticada** — nove
   superfícies nunca foram abertas. Pelo histórico da semana, a taxa de defeito
   visual no que não foi aberto não é baixa.
2. **Os quatro defeitos laranja**, que são perda silenciosa de trabalho do
   usuário (desfazer, container, autosave) e questão de LGPD (geo).
