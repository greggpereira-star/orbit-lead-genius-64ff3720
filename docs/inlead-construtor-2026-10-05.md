# O construtor do inlead, lido na documentação deles

**Fonte nomeada**, porque o construtor é fechado e eu não tenho conta lá:

- `ajuda.inlead.digital/guia-completo-de-componentes-do-construtor-na-inlead` — publicado em 05/10/2026
- `ajuda.inlead.digital/como-criar-um-funil-completo-do-zero-na-inlead-0` — publicado em 04/09/2026

Não vi o editor rodando. Tudo abaixo é a documentação oficial deles mais o que
dá para medir no nosso código. Onde for conclusão minha, está dito.

---

## 1. A diferença que explica a queixa

**O inlead não tem bloco composto.** A biblioteca inteira é atômica:

| Categoria | Componentes |
|---|---|
| Formulário | Campo, E-mail, Telefone, **Botão**, Número, Textarea, Data (beta), Altura, Peso |
| Quiz | Opções, Múltipla Escolha, Escolha Única, Sim/Não, Vídeo Resposta |
| Mídia e Conteúdo | **Texto** (rich text: títulos, parágrafos e links), Imagem, Vídeo, Áudio |
| Atenção | Alerta, Notificação, Timer, Loading, Nível |
| Argumentação | Argumentos, Depoimentos, FAQ, Preço, Checklist, Antes/Depois, Carrossel |
| Gráficos | Métricas, Gráficos |
| Personalização | Espaço, HTML/Script, Grupo |

Não existe nada como o nosso `intro`, que empacota imagem + título + subtítulo
+ botão. Cada tela é montada a partir de peças. É por isso que lá dá para pôr
o que se quiser entre um título e um botão, e aqui não dava.

## 2. O Botão é componente de navegação, não apêndice

A documentação deles descreve o Botão assim:

> Ações: pode ser configurado para **Redirecionar** (URL externa, como checkout
> ou WhatsApp) ou **Navegar entre as etapas** (avançar para a próxima ou pular
> para uma etapa específica).

E ainda: cores sólidas ou transparentes, animação de piscar, auto relevo, e
**fixo no rodapé**.

No nosso player o avanço pertencia ao ÚLTIMO bloco do fluxo da etapa
(`ultimoNoFluxo`). Um botão posto no meio não avançava nada e ficava
`hidden` — sumia do quiz publicado enquanto continuava visível no construtor.
Eu tinha acabado de escrever um aviso no validador para explicar isso; o aviso
era remendo sobre um modelo errado.

**Corrigido:** um bloco Botão explícito passa a ser o dono do avanço da etapa,
e `ctaUrl` preenchido faz dele um redirecionamento. O aviso antigo saiu; ficou
um bem mais estreito, para o caso de dois botões sem link na mesma etapa.

## 3. O que eles têm e nós não

Em ordem do que mais afeta "fácil de construir":

| O que | Como é lá | Como está aqui |
|---|---|---|
| ~~**Largura em %**~~ | "ajustar a largura do componente (ex: 50%) para alinhar dois lado a lado" | ✅ feito em 05/10 — Inteira/Metade/Um terço/Um quarto, com volta à linha inteira no celular |
| **Alerta** | componente próprio, 6 estilos: erro, info, sucesso, atenção, neutro e **cor do tema** | não existe |
| **Timer com atraso** | regra "Mostrar após" — o timer aparece e começa depois de N segundos | contador sem atraso |
| **Sim/Não** | pergunta binária de um clique | monta-se com Escolha Única |
| **Número** | campo numérico dedicado | `short-text` com máscara |
| **Vídeo Resposta** | captura resposta em vídeo | não existe |
| **Disposição da imagem** | imagem acima, abaixo ou ao lado do texto, por componente | só nos blocos que já preveem |
| **Áudio** | estilos: padrão, imitando Instagram, modo escuro | player simples |
| **Grupo** | agrupa componentes para aplicar UMA regra condicional a vários | temos `container`; falta confirmar se a regra condicional vale para o grupo |

## 4. O que nós temos e eles não documentam

Vale dizer, para a comparação não ficar só de um lado: trava de edição com
heartbeat, nota de conversão por etapa, análise de funil com mediana, modelos
de quiz inteiros versionados em código e testados, e o validador de publicação
com bloqueios e avisos.

## 5. Ordem sugerida

1. ~~**Largura em %**~~ — **feito em 05/10.** Ver §6.
2. **Alerta** — componente barato e muito usado em funil.
3. **Timer com "Mostrar após"** — um campo.
4. **Sim/Não** e **Número** — atalhos sobre o que já existe.
5. Vídeo Resposta e estilos de áudio — maiores, e menos frequentes.

---

## 6. Largura em fração — como ficou

Quatro opções: Inteira, Metade, Um terço, Um quarto. A linha da etapa virou
`flex-wrap`; com todo bloco em 100% o empilhamento é idêntico ao de antes.

**A conta do espaçamento é o que erraria calado.** Numa linha com `gap` de
24px, dois itens de 50% não cabem juntos — somam 100% mais 24px e o segundo
quebra para baixo, parecendo que a funcionalidade não funciona. Cada item cede
a parte que lhe cabe:

    n itens de w% + (n−1) espaçamentos = 100%
    → cada um mede  calc(w% − g·(1 − w/100))

Aferido nos dois renderizadores, em produção:

| Onde | Espaçamento | Largura da linha | Bloco de Metade |
|---|---|---|---|
| canvas | 0 | 384px | `50%` → **192px** |
| player | 24px | 416px | `calc(50% - 12px)` → **196px** |

No player, 196 + 24 + 196 = 416 — a linha fecha cravada.

No celular a fração é ignorada por padrão: 50% de 390px são 195px, e texto
nessa medida vira coluna de duas palavras. Há uma caixa "manter lado a lado no
celular" para quem quer mesmo.
