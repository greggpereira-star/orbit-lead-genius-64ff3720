# Sistema visual do Alt LeadFlow

Lido das duas referências que o usuário enviou em 03/10/2026 (QorTrade e Fynix,
estudos de caso do Behance) e do que já está em produção. O que é medida da
referência está marcado como tal; o que é decisão nossa está marcado como
decisão.

---

## 1. O que as duas referências têm em comum

Olhei o QorTrade (CRM de gestão de ações) e o Fynix (SaaS financeiro com IA).
São projetos diferentes, de autores diferentes, e convergem em cinco pontos.
É isso que "quiet luxury" quer dizer na prática.

### 1.1 A paleta é minúscula

O Fynix publica a dele com hex (página 7 do PDF):

| Papel | Hex | Observação |
|---|---|---|
| Acento | `#9FE870` | verde ácido, **um só** |
| Quase-preto | `#062F28` | verde-escuro, **não é preto nem cinza-azulado** |
| Cinza | `#7B787B` | **um só** tom de texto secundário |
| Branco | `#FFFFFF` | superfície do cartão |

Quatro cores. O QorTrade usa a mesma estrutura: um verde ácido, um quase-preto,
cinzas, branco.

**O detalhe que mais importa:** o "preto" é *tingido*. `#062F28` é verde muito
escuro, não `#000` nem um slate azulado genérico. Isso é o que dá a sensação de
marca — e custa uma linha de token.

### 1.2 O acento aparece pouco e forte

Em toda a tela do QorTrade há **um** cartão verde preenchido, **uma** pílula e
**um** badge. O resto é branco sobre cinza-claro. O acento não é distribuído em
tons pastel por toda a interface: ele marca a coisa mais importante da tela e
some no resto.

### 1.3 Cartão sem borda

Nas duas referências o cartão é branco, raio grande (~20–24px), **sem borda**, e
separado do fundo só por superfície e uma sombra muito suave. Borda de 1px é o
recurso que estávamos usando para fazer o cartão existir — e é justamente o que
faz parecer formulário.

### 1.4 O número é o herói

`$422,525` com o `.82` em **cinza-claro**. `$20,670` com o `USD` pequeno ao
lado. `+21%` em tamanho de título. O dado que importa é tipograficamente a maior
coisa da tela, e os acessórios dele (centavos, moeda, unidade) recuam.

### 1.5 Ícone é monocromático em círculo neutro

Nas duas referências os ícones de ação são **brancos ou quase-pretos em círculos
neutros**. Não há azulejo pastel colorido por assunto.

---

## 2. Onde estamos e o que muda

### 2.1 O que já está certo

A inversão de superfície — página tonal, cartão branco — foi implementada em
03/10 e é exatamente o que as duas referências fazem. Mantém.

Números tabulares em telefone, data e valor. Mantém.

### 2.2 O que contradiz as referências

**Os discos pastel por assunto.** Hoje a ficha tem cinco cores de disco (azul,
rosa, verde, âmbar, violeta) mais quatro tons nas respostas do formulário mais
seis em `AVATAR_TONES` — até quinze matizes numa tela. As duas referências usam
**um** acento.

Isso foi aprovado pelo usuário na réplica, e a decisão é dele. Mas as
referências que ele próprio mandou apontam para o contrário, e o parecer
independente que rodei em 03/10 chegou à mesma conclusão sem ver as referências.
**Pendente de decisão.**

---

## 3. Plano de adoção, em ordem de retorno

Cada item é independente e pode ir sozinho.

| # | Mudança | Alcance | Risco |
|---|---|---|---|
| 1 | Quase-preto tingido no lugar do slate genérico | token, todas as telas | baixo |
| 2 | Cartão sem borda, raio 20px, sombra mais suave | `.cartao`, todas as telas | baixo |
| 3 | Número herói: valor grande com acessório recuado | valor da venda, fatos, relatórios | baixo |
| 4 | Disco monocromático no lugar dos cinco matizes | ficha do lead | **depende de decisão** |
| 5 | Ícone de ação em círculo neutro | cabeçalho da ficha, board | médio |
| 6 | Acento só na coisa mais importante de cada tela | todas | médio |

### 3.1 Item 1 — o quase-preto

Hoje: `--foreground: oklch(0.12 0.03 264)` → `#0F172A`, slate azulado padrão do
shadcn.

Proposta: manter a luminância e aumentar levemente o croma na direção da marca,
de modo que o texto tenha temperatura própria sem virar colorido. A escolha do
matiz é decisão de marca, não minha.

### 3.2 Item 2 — o cartão

```css
.cartao {
  border: none;                      /* era 1px solid var(--linha-sutil) */
  border-radius: 20px;               /* era 16px */
  box-shadow: 0 1px 2px rgb(15 23 42 / .04), 0 12px 28px -16px rgb(15 23 42 / .18);
}
```

No escuro a borda **volta**, porque sem diferença de luminância suficiente a
sombra não separa nada — é a mesma regra que já está no arquivo.

### 3.3 Item 3 — número herói

Padrão: valor em `text-[22px] font-semibold tracking-[-0.02em] tabular-nums`, e
o acessório (centavos, moeda, unidade, variação) em
`text-muted-foreground` num grau abaixo. Aplica em valor da venda, na faixa de
fatos e nos relatórios.

---

## 4. O que NÃO copiar

**O verde ácido.** `#9FE870` é a marca do Fynix e do QorTrade, não a nossa. O
que se copia é a *estrutura* — um acento, usado pouco —, não o matiz.

**Mockup com dado inventado.** As duas referências mostram números bonitos que
não existem. Aqui a regra continua: só afirmar o que foi medido, com a fonte
nomeada.

**A tipografia de display.** Space Grotesk e Urbanist são escolhas daqueles
projetos. Trocar a família do app inteiro é decisão de marca com custo de
carregamento, não refinamento de tela.
