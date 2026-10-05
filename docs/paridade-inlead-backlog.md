# Paridade com o inlead — backlog de construção

Objetivo definido pelo cliente: **copiar o editor do inlead**, não se inspirar nele.
Paridade de recurso a recurso, mantendo o que já temos depois do lead.

**Única coisa que não é copiada:** o código-fonte minificado e os ativos de marca
deles. Todo comportamento é reimplementado no nosso código. Na prática isso não
muda nada do produto final — muda só de onde vem a linha de código.

Estado medido em 05/10/2026.

---

## 0. Pré-requisito (não negociável)

Os 4 defeitos graves da auditoria entram antes, porque **o inlead já tem a
proteção que nos falta**: a mensagem `"Nenhuma etapa de captura identificada"`
está no código deles. Copiar o editor sem copiar essa validação seria copiar
pela metade.

- Pontuação máxima ignorando blocos invisíveis
- Última etapa oculta travando o visitante
- Validação ao publicar (incluindo "sem etapa de captura")
- Aviso ao sair sem salvar

---

## 1. Estrutura de navegação

| inlead | Nós hoje | Ação |
|---|---|---|
| Construtor | `builder` | — |
| **Design** | dentro do inspector | **criar rota `/design`** |
| Fluxo | `flow` | — |
| **Resultados** | faixas no settings | **criar rota `/results`** |
| Respostas | dentro de `performance` | separar |
| Leads | `leads` | — |
| Performance | `performance` | enriquecer (§6) |
| **Análise IA** | — | §8 |

---

## 2. Aba Design

Modelo deles, capturado de um funil publicado:

```
logo · themeColor · contentColor · titleColor · backgroundColor
featuredFont · contentFont · titleSize · contentSize
rounded · elementSize · verticalAlign
```

Nosso `QuizDesign` já tem: `primary, background, surface, text, muted, radius,
fontHeading, fontBody, buttonStyle, progressStyle, presetId`.

**Falta:** `logo`, `titleColor` separado de `text`, `titleSize`, `contentSize`,
`elementSize` (altura do botão/campo), `verticalAlign`.

Recursos do editor deles a copiar:
- `Herdar do tema` em cada bloco
- `Cores do documento` / `Cores salvas` / `Paleta de cor`
- `Selecionar cor na tela` (conta-gotas — `EyeDropper` API)
- `Presets` (já temos) e `Retornar ao design padrão`
- `Design por etapa` sobrescrevendo o do funil (`step.design`)

**Arquivos:** `types.ts`, `design-presets.ts`, novo `_app.quizzes_.$id.design.tsx`,
`QuizPlayer.tsx`, `QuizPreview.tsx`.

---

## 3. Canvas com camadas

Modelo deles: `funnel → steps[] → step.layers[]`, com grupos aninhados
(`ReactSortable` com grupos `components`, `layers`, `group`).
Largura padrão do contêiner: `max-w-[28rem]`.

| Recurso | Nosso estado |
|---|---|
| `Camadas` / `Tipo de layer` | temos `blocks` + `container` — perto, falta a nomenclatura e o painel de camadas |
| `Grade de 2/3/4 colunas` | ❌ |
| `Fixado ao topo` / `Fixar no rodapé` / `Flutuante` / `Tela inteira` | ❌ |
| `Encaixe`, `Posição na tela` | ❌ |
| `step.options.show_back` (botão voltar por etapa) | ❌ |

É o item mais caro. Fica depois de 2, 4 e 5.

---

## 4. Componentes a criar

| Componente | Ajustes a copiar |
|---|---|
| **Gráfico** | Cartesiano · Circular · Radial · Linear · Angular · Régua; eixos X/Y, grade X/Y, área, pontos, traços; `Conjuntos de dados`, legenda por dado, `Destacar a legenda deste dado`, `Esconder o círculo deste dado` |
| **Agendamento** | `Data e hora` · `Permitir intervalo` · `Permitir seleção de horário` · `Bloquear datas passadas` · `Horário de início/fim` · `Dia de semana` · `Dia do mês` |
| **Preço** | `Tipo de preço` · Real/Dólar/Euro · `Prefixo` · `Sufixo` |
| **Campo com máscara** | `Selecione uma máscara` · `Limite de caracteres` · `Placeholder` · `Campo obrigatório` |
| **Medidor / Nível / Régua** | `Mostrar medidor` · `Nível:` · `Amplitude` · `Ritmo` |
| **Script por bloco** | `função onClick (Script/Código)` |
| **Grade / Cards / Sumário / Indicador / Seta / Emoji / Marca-Logo / Redes sociais** | itens de paleta que faltam |

Já temos equivalente: Depoimentos, Antes/Depois, Vídeo, Áudio, Carrossel, Barra
de progresso, Contador, FAQ, Lista, Banner/Hero, Comparativo.

---

## 5. Lógica

| inlead | Nós |
|---|---|
| `Lógica básica` | ✅ salto por opção |
| **`Lógica por porcentagem`** | ❌ |
| **`Lógica por quantidade`** | ❌ |
| `Fórmulas e variáveis` (Soma/Subtração/Multiplicação/Divisão, `Cálculo final`) | ✅ `variables.ts` — falta a interface |
| `Regras de exibição` | ✅ `showIf` |
| **`logicRules` editável** | ❌ existe no motor, sem interface |

Também: `gte`/`lte`/`between` faltam em `evaluateLogic`.

---

## 6. Performance

A copiar: `Taxa de conclusão`, `Taxa de interação`, `Taxa de rejeição`,
`Tempo Médio`, `Média de Etapas Concluídas`, `Profundidade média`,
**`Melhor horário`**, **`Melhor origem`**, `Passaram da última etapa do funil`,
`vs período anterior`, recortes por campanha e dispositivo, `Ver resultados da etapa`.

**Nota de conversão por etapa**, com as cores deles:

| Faixa | Cor |
|---|---|
| Baixa | `#F24822` |
| Média | `#FFCD29` |
| Alta | `#14AE5C` |
| Super alta | `#008043` |

Mostrada no Construtor **e** na Performance.

---

## 7. Colaboração

`Edição em uso por outra aba` · `Deseja assumir a edição desse funil?` ·
`Assumir edição` · `Controle solicitado!` · `Usuário atual:` · `Aguarde para assumir`

Trava com pedido de controle, não edição simultânea. Resolve perda silenciosa de
trabalho quando dois abrem o mesmo quiz.

---

## 8. IA

**8a. Análise IA** — `Analisar funil`, `Descubra onde seu funil perde conversões`,
`O que está funcionando`, `Mudanças sugeridas (N)`, `Ver última análise`,
limite de 60 etapas por análise.
Começa pelas regras determinísticas (sem capturar lead, etapa com queda alta,
etapa sem botão); a IA entra por cima para redigir e priorizar.

**8b. Editar com IA (beta)** — comandos que **alteram o esquema**, com Desfazer/Refazer.
Os exemplos deles servem de caso de teste:
"Faça esse botão ficar rosa" · "Crie mais curiosidade no título" ·
"Crie uma seção de depoimentos" · "Faça um formulário de contato" ·
"Crie mais uma pergunta no quiz" · "Melhore a copy deste bloco" ·
"Adicione prova social" · "Adicione um loader animado" ·
"Adicione uma oferta no final" · "Use cores mais vibrantes"

---

## 9. Operação

`Duplicar etapa` · `Arquivar`/`Desarquivar` · `Exportar leads` com link de
validade · `Resetar dados` · `Pular tutorial` (passo a passo no primeiro uso) ·
`Auto-organizar` no Fluxo · `Modelos`/`Biblioteca`/`Mais usado` ·
rodapé "Criado via" com UTM de indicação.

---

## Ordem de execução

| Onda | Conteúdo | Situação |
|---|---|---|
| **0** | Defeitos graves + validação ao publicar | ✅ 05/10 — `d5aefc3` |
| **1** | **Aba Design** completa (§2) | ✅ 05/10 — `f04fffd` |
| **2** | **Nota de conversão por etapa** (§6) + trava de edição (§7) | ✅ 05/10 — `f38b99b` |
| **3** | Grade de colunas, opção com imagem, botão voltar, duplicar/arquivar | ✅ 05/10 — `da07437` |
| **4** | Componentes novos (§4) | ✅ 05/10 — `ec67d23` |
| **5** | Lógica por porcentagem/quantidade + editor de regras (§5) | ✅ 05/10 — `74a568d` |
| **6** | Análise IA → Editar com IA (§8) | ⬜ próxima |
| **7** | Camadas e posicionamento livre (§3 completo) | ⬜ |

### O que ficou de fora das ondas entregues

- **Medidor/Régua** (§4): o bloco `level` já cobria; não foi duplicado.
- **Som e gamificação** (contador com som de dinheiro, conquista, comparativo
  de nota): **não vêm do inlead**, que não tem nada disso. Vieram dos cases
  `isack` e `guisalezze` e seguem pendentes, em paralelo às ondas.

Som, gamificação e gatilhos (contador com som de dinheiro, conquista, comparativo
de nota) **não vêm do inlead** — ele não tem. Entram em paralelo quando você quiser,
e são onde passamos à frente em vez de empatar.
