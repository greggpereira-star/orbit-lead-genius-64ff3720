# Estudo do concorrente: inlead

Data: 05/10/2026.

## Como isto foi levantado

Três fontes, todas públicas:

1. **O pacote JavaScript do editor deles.** A tela `/dashboard/funnel/[id]` exige
   login, mas o arquivo que a desenha é servido aberto. Baixei os 495 KB e
   extraí **566 textos de interface**. É o inventário de recursos do editor,
   escrito por eles.
2. **O mapa de rotas** (`_buildManifest.js` do Next.js), que lista as 40 telas do produto.
3. **Um funil-modelo publicado** (`inlead.digital/livemind-template/`), percorrido como visitante.

**O que eu não fiz:** o esquema do funil (`__NEXT_DATA__.props.pageProps.q`) vem
**criptografado em AES** — eles protegem o conteúdo contra cópia. Não tentei
decifrar. Tudo abaixo veio de texto de interface e de páginas renderizadas.

---

## 1. Estrutura do produto

O funil deles tem **8 abas**; o nosso tem 6.

| Aba inlead | Temos? |
|---|---|
| Construtor | ✅ |
| **Design** (identidade global, separada do construtor) | ❌ |
| Fluxo | ✅ |
| **Resultados** | ⚠️ parcial (faixas, sem tela própria) |
| Respostas | ✅ |
| Leads | ✅ |
| Performance | ✅ |
| **Análise IA** (beta, só planos altos) | ❌ |

Planos citados no código: `elite`, `scale`, `diamond` — **mais do que os três
públicos** (BASIC/PRO/ELITE). Conclusão minha: há faixas não anunciadas, e a IA
é o recurso que sustenta o preço do topo.

---

## 2. O que eles têm que nós não temos

### 2.1 Duas IAs diferentes, não uma

**(a) "Editar com IA (beta)" — comandos em linguagem natural dentro do editor.**
Os exemplos estão escritos no pacote deles:

> "Faça esse botão ficar rosa" · "Crie mais curiosidade no título" ·
> "Crie uma seção de depoimentos" · "Faça um formulário de contato" ·
> "Crie mais uma pergunta no quiz" · "Melhore a copy deste bloco" ·
> "Adicione prova social" · "Adicione um loader animado" ·
> "Adicione uma oferta no final" · "Adicione uma sombra brilhante" ·
> "Ajuste a texto para melhorar a leitura" · "Use cores mais vibrantes"

Com `Mudanças sugeridas (N)`, `Desfazer`, `Refazer`. **Conclusão minha:** a IA
não escreve texto — ela **edita o esquema do funil**. É um agente com ferramentas
sobre o schema, não um gerador de copy.

**(b) "Análise IA" — auditoria de conversão do funil.**

> "Analisar funil" · "Descubra onde seu funil perde conversões" ·
> "Coletando os dados do funil" · "Analisando seu funil" ·
> "Análise cobre as primeiras 60 etapas" · "O que está funcionando" ·
> "Ver última análise" · "Nova análise"

E dois achados que valem por si:

- **"Nenhuma etapa de captura identificada"** — eles têm exatamente a validação
  que eu propus na Onda 1. Confirma que o buraco é real e conhecido no mercado.
- **"+2 campos de formulário"** — a análise devolve recomendação **concreta e
  acionável**, não texto genérico.

### 2.2 Nota de conversão por etapa

Cada etapa recebe uma classificação com cor, lida direto do código deles:

| Faixa | Cor |
|---|---|
| Baixa conversão | `#F24822` |
| Média conversão | `#FFCD29` |
| Alta conversão | `#14AE5C` |
| Super alta conversão | `#008043` |

Mais `Crítico`, `Ótimo`, `Score e Desempenho`, `Ver resultados da etapa`.
**Conclusão minha:** isto é o que transforma a aba de performance em ferramenta
de trabalho. O nosso painel mostra números; o deles aponta **onde mexer**.

### 2.3 Edição colaborativa com trava e tomada de controle

> "Edição em uso por outra aba" · "Deseja assumir a edição desse funil?" ·
> "Assumir edição" · "Aguarde para assumir a edição" · "Controle solicitado!" ·
> "Usuário atual:" · "Funil em edição"

Não é edição simultânea: é **trava com pedido de controle**. Muito mais simples
de construir do que CRDT, e resolve o problema real (dois da agência abrindo o
mesmo funil). Nós não temos nada — dois editores hoje sobrescrevem um ao outro
em silêncio.

### 2.4 Aba Design — identidade global do funil

Capturei o objeto de design de um funil publicado deles, em claro:

```json
{ "logo": {...}, "themeColor": "#6d28d9", "contentColor": "#6b7280",
  "titleColor": "#030712", "backgroundColor": "#ffffff",
  "featuredFont": "inter", "contentFont": "inter",
  "titleSize": 0.5, "contentSize": 16,
  "rounded": "rounded-2xl", "elementSize": "56px" }
```

Onze propriedades resolvem a identidade do funil inteiro. No editor ainda há
`Herdar do tema`, `Cores do documento`, `Cores salvas`, `Paleta de cor`,
`Presets`, `Retornar ao design padrão` e **`Selecionar cor na tela`** (conta-gotas).

### 2.5 Camadas e posicionamento livre

> `Camadas` · `Tipo de layer` · `Encaixe` · `Posição na tela` · `Fixado ao topo` ·
> `Fixar no rodapé` · `Flutuante` · `Tela inteira` · `Grade de 2/3/4 colunas`

**Conclusão minha:** o construtor deles é uma **tela de design**, não uma pilha
de blocos. É a diferença estrutural mais cara de alcançar, e a que mais pesa na
impressão de "está muito bom".

### 2.6 Três modos de lógica

> `Lógica básica` · `Lógica por porcentagem` · `Lógica por quantidade`

Nós temos só o equivalente ao básico (salto por opção). "Por porcentagem" e "por
quantidade" ramificam pelo **acumulado** — quantas vezes a pessoa escolheu algo,
ou que fatia das respostas foi de um tipo. É o que permite perfil sem montar
dezenas de regras.

### 2.7 Componentes que faltam no nosso catálogo

| Componente | Ajustes que eles expõem |
|---|---|
| **Gráfico** | Cartesiano, Circular, Radial, Linear, Angular, Régua · eixos X/Y, grade, área, pontos, traços · `Conjuntos de dados`, legenda por dado, `Esconder o círculo deste dado` |
| **Calendário / agendamento** | `Data e hora`, `Permitir intervalo`, `Permitir seleção de horário`, `Bloquear datas passadas`, `Horário de início/fim`, `Dia de semana`, `Dia do mês` |
| **Preço** | `Tipo de preço`, Real/Dólar/Euro, `Prefixo`, `Sufixo` |
| **Campo com máscara** | `Selecione uma máscara`, `Limite de caracteres`, `Placeholder`, `Campo obrigatório` |
| **Script por bloco** | `função onClick (Script/Código)`, `Digite seu script...` |
| **Medidor / Nível / Régua** | `Mostrar medidor`, `Nível:`, `Amplitude`, `Ritmo` |

E os que **já temos** e eles também: Depoimentos, Antes/Depois, Vídeo (autoplay,
loop), Áudio, Carrossel, Barra de progresso, Contador, FAQ, Lista, Banner, Hero.

### 2.8 Performance mais fina que a nossa

> `Taxa de conclusão` · `Taxa de interação` · `Taxa de rejeição` · `Tempo Médio` ·
> `Média de Etapas Concluídas` · `Profundidade média aproximada no período` ·
> **`Melhor horário`** · **`Melhor origem`** · `Passaram da última etapa do funil` ·
> `vs período anterior` · por campanha e por dispositivo

`Melhor horário` e `Melhor origem` são respostas de negócio prontas. O nosso
painel entrega os dados crus para a pessoa concluir sozinha.

### 2.9 Operação

- `Modelos` / `Biblioteca` / `Mais usado` — galeria de modelos
- `Duplicar etapa`, `Arquivar`/`Desarquivar`
- `Exportar leads` com solicitação assíncrona e **link com validade**
- `Resetar dados`
- `Pular tutorial` — passo a passo guiado no primeiro uso
- `Auto-organizar` no Fluxo
- Rodapé "Criado via inlead.digital" com **UTM de indicação** em todo funil de cliente

---

## 3. Onde nós já estamos à frente

Medido no nosso código, não suposto:

| Nosso recurso | Situação no inlead |
|---|---|
| **Teste A/B por bloco com promoção de variante** | Não aparece em nenhum dos 566 textos. Só `Variações` |
| **CRM embutido** (etapas, board, responsável) | Não têm — exportam lead para fora |
| **Motor de automação** com gatilhos e fila | Não aparece |
| **WhatsApp por faixa de pontuação** | Não aparece |
| **Consentimento LGPD com exportação e exclusão de titular** | Só "Conformidade com LGPD garantida" no site |
| **CAPI da Meta server-side + Google Ads** | Eles têm Pixel e webhook |
| **Recuperação de abandono** | Não aparece |

**Conclusão minha:** eles ganham no **editor**; nós ganhamos no **depois do
lead**. A disputa não é empatada — são produtos com centro de gravidade
diferente. Copiar o editor deles sem perder o nosso lado é a estratégia.

---

## 4. Plano revisado

A **Onda 1 da auditoria anterior continua primeiro** — nada aqui substitui
corrigir a pontuação, a etapa travada e a publicação sem validação.

### Onda 2 — Paridade de editor (o que mais pesa na percepção)

| # | O quê | Por quê |
|---|---|---|
| 1 | **Aba Design**: logo, 4 cores, 2 fontes, 2 tamanhos, arredondamento, altura de elemento, com `Herdar do tema` por bloco | 11 propriedades resolvem a identidade do funil inteiro. É o melhor retorno por esforço de toda a lista |
| 2 | **Trava de edição com pedido de controle** | Dois editores hoje se sobrescrevem **em silêncio**. É perda de dados, não só falta de recurso |
| 3 | **Nota de conversão por etapa** no construtor e na performance, com as 4 faixas de cor | Transforma o painel de "números" em "onde mexer" |
| 4 | **Grade de 2/3/4 colunas** e opção com imagem grande | Os três cases usam. Hoje nossa opção é sempre lista empilhada |
| 5 | `Duplicar etapa`, `Arquivar`, passo a passo guiado no primeiro uso | Operação do dia a dia |

### Onda 3 — Som, gamificação e gatilhos

Inalterada em relação ao plano anterior (contador com som de dinheiro, conquista,
comparativo de nota, saída por intenção, botão voltar, confete). **Nota:** o
inlead **não tem** nada disso. Esses recursos vêm dos cases 1.1 e 1.2, não dele —
são onde podemos ficar **à frente**, não só empatar.

### Onda 4 — Componentes novos

Agendamento (calendário com horário), Gráfico configurável, Preço com moeda,
Campo com máscara, Medidor/Régua.

### Onda 5 — Lógica e IA

| # | O quê |
|---|---|
| 1 | Lógica por **porcentagem** e por **quantidade**, além da básica |
| 2 | **Auditoria de conversão por IA**: lê o esquema + as métricas e devolve recomendação concreta ("faltam campos de captura", "etapa 4 perde 61%"). Começa pelas regras determinísticas que já sabemos checar; a IA entra depois, por cima |
| 3 | **Editar com IA**: comandos em linguagem natural que alteram o esquema, com Desfazer |

### Onda 6 — Camadas

Posicionamento livre, fixar no topo/rodapé, flutuante, tela inteira. É a mudança
estrutural mais cara; fica por último de propósito.

---

## 5. Recomendação

**Conclusão minha, não medição:** o que faz o editor deles parecer muito bom não
é a quantidade de componentes — é **Design global + nota de conversão por etapa +
camadas**. Dessas três, as duas primeiras cabem em uma onda curta e entregam a
maior parte da impressão. Camadas é projeto à parte.

E o caminho para ficarmos **melhores**, não iguais, não passa pelo editor: passa
por ligar o que já temos depois do lead (CRM, automação, WhatsApp por faixa, CAPI)
ao que vamos construir agora. O inlead entrega o lead e acaba ali.
