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
| ~~9~~ | ~~Passo a passo guiado no primeiro uso~~ | ✅ seis cartões ancorados no construtor, só em tela ≥1024 |
| ~~9~~ | ~~`Auto-organizar` no Fluxo~~ | **falso achado**: já existia como "Organizar layout" (`handleReorganize`). Minha auditoria buscou pelo nome do inlead e não encontrou o nosso |
| ~~9~~ | ~~Biblioteca pública de modelos~~ | ✅ galeria com filtro por nicho e prévia das etapas |
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

## 2b. Fechamento dos achados — 05/10, 13h

Tudo abaixo foi **exercitado no navegador**, não só compilado.

| Item | Como foi verificado |
|---|---|
| Números contraditórios (100% × 12%) | Cartão e Análise mostram **10%** os dois, com "ÚLTIMOS 30 DIAS" escrito na tela |
| Máscara não capturava | Quiz publicado (antes era barrado) e percorrido: **lead criado** com `(27) 96655-4433` |
| Desfazer partia a etapa | Excluí um bloco de uma etapa de dois e desfiz: voltou **na mesma etapa, na posição original**, e seguem 5 etapas |
| Geo por terceiro | `performance` na página pública: **0 chamadas** a `ipapi`; externos só Google Fonts e o Pixel |
| Container colapsava etapas | Só código e typecheck — não encontrei quiz legado sem `steps` para exercitar |
| Autosave sem nova tentativa | Só código — exigiria derrubar a rede no meio do salvamento |

**Defeito novo achado durante esse teste e corrigido:** o lead criado pelo campo
mascarado nasceu com `name = "(27) 98877-5544"`. O nome sai do primeiro
`Texto curto` do quiz, e o campo mascarado passou a ser esse primeiro. Campo com
máscara é telefone, CPF ou CEP — nunca nome; agora é excluído da busca pelo nome.
Reconferido no ar: o lead seguinte nasceu com nome vazio e telefone certo.

### Amarelos fechados — 05/10, 14h

**Pontuação negativa.** O percentual passou a ser normalizado sobre a faixa
alcançável (`minPossibleScore` simétrico do máximo). Medido num quiz com
penalidade: quem acertou METADE saía com 0% e caía no fundo da escala, igual a
quem errou tudo; agora sai com 50%. Em quiz sem negativos nada muda.

**Progresso.** Verificado no ar, em três passagens: grava a cada resposta, retoma
na etapa certa com a **mesma sessão** (para não virar um lead novo), e limpa ao
gravar a submissão. Descarta quando o quiz foi editado ou passam 24h.

Duas correções foram necessárias depois do primeiro teste, as duas achadas no ar:
a limpeza dependia de `done`, que nunca vira verdadeiro quando a última etapa tem
resultado visível; e, corrigido isso, o efeito de gravação disparava logo em
seguida e regravava por cima — a limpeza durava um instante.

**Limitação conhecida, deixada de propósito:** ao retomar, o botão "Voltar"
some até a pessoa avançar de novo. O histórico de etapas não é persistido, e
reconstruí-lo seria inventar um caminho que o visitante pode não ter percorrido
— com salto condicional, isso o mandaria para uma tela que ele nunca viu.

**Também confirmado funcionando nesta passada:** o controle "Mostrar botão voltar
nesta etapa" aparece ao expandir a etapa, e o selo de visitantes por etapa
atualiza (6👤, 4👤, 3👤, 2👤).

## 2c. Os recursos do inlead — entregues em 05/10

Dos 17 listados, um era **falso achado** (`Auto-organizar` já existia como
"Organizar layout"). Dos 16 restantes, 15 entregues e 1 travado.

| Recurso | Situação |
|---|---|
| `Herdar do tema` por bloco | ✅ `f0e7b7c` |
| Design por etapa (`step.design`) | ✅ `f0e7b7c` |
| `Cores do documento` | ✅ `f0e7b7c` |
| `Taxa de rejeição` | ✅ `c6fba2c` |
| `Tempo médio` | ✅ `c6fba2c` |
| `Média de etapas concluídas` | ✅ `c6fba2c` |
| `Profundidade média` | ✅ `c6fba2c` |
| **`Melhor horário`** | ✅ `c6fba2c` |
| **`Melhor origem`** | ✅ `c6fba2c` |
| `Exportar leads` completo | ✅ `c738fb1` — sem o "link de validade", ver abaixo |
| `Resetar dados` | ✅ `c738fb1` |
| Rodapé "Criado via" com UTM | ✅ `c738fb1` — **desligado por padrão** |
| Aba **Resultados** própria | ✅ `1f7c480` |
| Aba **Respostas** separada | ✅ `1f7c480` |
| Script `onClick` por bloco | ✅ `1f7c480` |
| 8 componentes de conteúdo | ✅ `18e7326` |
| Camada de IA | ⛔ sem chave no servidor |

### Dois desvios conscientes

**Link de validade na exportação.** No inlead o arquivo vai por e-mail e o link
precisa expirar. Aqui o download é imediato: um link que expira sem existir seria
teatro. O que foi entregue é a substância — a exportação deixou de sair truncada
em 100 linhas, em silêncio, e passou a trazer as UTMs.

**Rodapé "Criado via".** Entregue, mas **desligado por padrão**. O funil é visto
pelo cliente do nosso cliente; carimbar nossa marca na página dele sem ele pedir
é decisão dele, não nossa. Liga em Configurações → SEO.

### O que ficou de fora, e por quê

| Recurso | Motivo |
|---|---|
| **Painel de camadas** | O posicionamento fora do fluxo foi entregue na Onda 7; o painel em si é interface de canvas livre, que decidimos não perseguir |
| `Encaixe` (snap) | Depende do canvas livre acima |
| ~~Itens de paleta~~ | ✅ `18e7326` — Grade, Cards, Sumário, Indicador, Seta, Emoji, Marca/Logo e Redes sociais |
| ~~Biblioteca pública de modelos~~ | ✅ seis modelos escritos em código + galeria. **A tabela `quiz_templates` tinha os seis com `blocks: []`** — "Usar Template" criava um quiz vazio com nome bonito |
| ~~Passo a passo guiado no primeiro uso~~ | ✅ `TutorialGuiado`, reabrível pelo botão de ajuda |

## 3. Sim, ainda há falhas conhecidas

Da auditoria de 05/10, confirmadas ainda presentes no código:

| Gravidade | Falha | Onde |
|---|---|---|
| ✅ | ~~Desfazer devolvia o bloco como etapa NOVA~~ — corrigido e verificado em 05/10 |
| ✅ | ~~`removeChildFromContainer` com `prev.steps ?? []`~~ — corrigido em 05/10 |
| ✅ | ~~Autosave não tentava de novo~~ — corrigido em 05/10 (recuo até 1 min) |
| ✅ | ~~Geolocalização por terceiro no enriquecimento~~ — removida em 05/10. A outra chamada ao mesmo serviço fica: só dispara quando o dono configurou restrição por país, e é a única forma de cumpri-la |
| ✅ | ~~Pontuação podia ficar negativa~~ — corrigido em 05/10: percentual normalizado sobre a faixa alcançável |
| ✅ | ~~Progresso não persistido~~ — corrigido e verificado em 05/10: retoma no `localStorage` por 24h, com a mesma sessão |
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

## Biblioteca de modelos e tutorial — 05/10/2026

**O defeito que isto corrigiu.** A tabela `quiz_templates` tinha seis linhas
ativas e todas com `schema.blocks = []`. O diálogo "Usar Template" listava as
seis, criava o quiz e entregava uma tela em branco com nome bonito. Nada acusava:
não havia tipo, não havia teste, e o validador de publicação nunca era chamado
sobre elas.

**Onde os modelos passam a morar.** Em `src/modules/quiz/quiz-templates.ts`, não
na tabela. A tabela continua sendo lida — para o dia em que houver modelo próprio
de cliente — mas `listTemplates` descarta linha sem bloco, para que o mesmo
defeito não volte por outro caminho. Nada foi apagado no banco.

Cada modelo tem 8 etapas: abertura, quatro perguntas que pontuam, tela de
análise, captura e resultado. A captura nunca é a primeira etapa. O teste roda
`validarPublicacao` em cima dos seis — um modelo que não publicaria quebra a
suíte.

**O que o navegador pegou e a compilação não.** Três coisas, todas invisíveis ao
`tsc`:

1. `rose-luxe` não existe entre os presets; o `?? DEFAULT_DESIGN` engolia em
   silêncio e o modelo de estética saía com o tema errado.
2. O campo do corpo do resultado é `resultBody`, não `resultDescription`. Os
   casts `as QuizBlock` aceitavam o nome errado e o texto seria descartado.
3. O tutorial abria direto no **passo 3 de 6**: o efeito que pula alvo ausente
   lia o `pos` inicial do mesmo render em que a medição ainda não tinha sido
   aplicada. Resolvido com três estados — ainda não medi / medi e não achei /
   achei.

**Véu do tutorial.** A primeira versão usava `box-shadow` com espalhamento de
9999px. Com o alvo alto (o painel lateral, 852px) não pintava nada. Trocado por
quatro faixas ao redor do alvo, com a aritmética em teste. Durante o diagnóstico
também confundi build antigo com defeito de CSS — registrado para não repetir:
**conferir qual build a tela está mostrando antes de culpar o estilo.**
