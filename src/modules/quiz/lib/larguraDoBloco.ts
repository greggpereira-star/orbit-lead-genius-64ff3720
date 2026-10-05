import type { CSSProperties } from "react";
import type { QuizBlock } from "../types";
import type { Breakpoint } from "./containerLayout";

/** Larguras oferecidas no inspetor. Fração, não pixel: é o que se adapta. */
export const LARGURAS = [
  { valor: 100, rotulo: "Inteira" },
  { valor: 50, rotulo: "Metade" },
  { valor: 33, rotulo: "Um terço" },
  { valor: 25, rotulo: "Um quarto" },
] as const;

/**
 * Largura do bloco dentro da linha da etapa.
 *
 * Existe para compor lado a lado — dois blocos de 50% dividem a mesma linha.
 * É o que o inlead chama de "ajustar a largura do componente (ex: 50%) para
 * alinhar dois componentes lado a lado", e era o que faltava para montar tela
 * sem empilhar tudo.
 *
 * **A conta do `gap` é o ponto que erra calado.** Numa linha com `flex-wrap` e
 * espaçamento `g`, dois itens de `50%` NÃO cabem juntos: somam 100% mais `g`, e
 * o segundo quebra para a linha de baixo — parecendo que a funcionalidade não
 * funciona. Cada item precisa ceder a parte do espaçamento que lhe cabe:
 *
 *     n itens por linha, cada um com w% → n·w% + (n−1)·g = 100%
 *     → cada item mede  calc(w% − g·(1 − w/100))
 *
 * Com w=50 e g=24 dá `calc(50% - 12px)`; com w=33 e g=24, `calc(33% - 16px)`.
 * Em 100% o desconto é zero, então um bloco sem largura escolhida continua
 * ocupando a linha inteira exatamente como antes desta funcionalidade existir.
 *
 * No celular a fração é ignorada por padrão: 50% de 390px são 195px, e texto
 * nessa medida vira uma coluna de duas palavras. Quem quiser mesmo lado a lado
 * — dois emojis, dois selos — liga `widthMobile`.
 */
export function larguraDoBloco(
  block: QuizBlock,
  breakpoint: Breakpoint,
  gap: number,
): CSSProperties {
  const w = block.blockStyle?.width;

  const cheia: CSSProperties = { width: "100%" };
  if (!w || w >= 100) return cheia;
  if (breakpoint === "mobile" && !block.blockStyle?.widthMobile) return cheia;

  const desconto = Math.round(gap * (1 - w / 100) * 100) / 100;
  return {
    width: desconto > 0 ? `calc(${w}% - ${desconto}px)` : `${w}%`,
    // Sem isto um bloco de conteúdo largo empurra a própria coluna e desfaz a
    // divisão — `min-width:auto` é o padrão de item flex.
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 1,
  };
}

/** Algum bloco da etapa divide linha? Serve para não mexer no layout à toa. */
export function etapaUsaFracao(blocos: QuizBlock[]): boolean {
  return blocos.some((b) => {
    const w = b.blockStyle?.width;
    return !!w && w < 100;
  });
}
