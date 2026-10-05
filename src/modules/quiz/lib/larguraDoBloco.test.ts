import { describe, it, expect } from "vitest";
import { larguraDoBloco, etapaUsaFracao, LARGURAS } from "./larguraDoBloco";
import type { QuizBlock } from "../types";

const bloco = (width?: number, widthMobile?: boolean): QuizBlock =>
  ({
    id: "b",
    type: "heading",
    blockStyle: width ? { width, widthMobile } : undefined,
  }) as QuizBlock;

describe("larguraDoBloco", () => {
  it("sem largura escolhida, ocupa a linha inteira — como antes da funcionalidade", () => {
    expect(larguraDoBloco(bloco(), "desktop", 24)).toEqual({ width: "100%" });
  });

  it("desconta a parte do espaçamento que cabe ao item", () => {
    // Dois de 50% com 24px entre eles: cada um cede 12px, senão o segundo quebra
    // para a linha de baixo e parece que nada funcionou.
    expect(larguraDoBloco(bloco(50), "desktop", 24).width).toBe("calc(50% - 12px)");
  });

  it("a conta fecha em 100% para dois, três e quatro por linha", () => {
    const gap = 24;
    for (const [w, n] of [
      [50, 2],
      [33, 3],
      [25, 4],
    ] as const) {
      const css = larguraDoBloco(bloco(w), "desktop", gap).width as string;
      const desconto = Number(css.match(/- ([\d.]+)px/)![1]);
      // A linha fecha quando as duas contas batem:
      //   as frações somam ~100%  e  o desconto total iguala os espaçamentos.
      expect(Math.abs(n * w - 100), `${n}x${w}% não soma 100%`).toBeLessThanOrEqual(1);
      expect(
        Math.abs(n * desconto - (n - 1) * gap),
        `desconto de ${n}x${desconto}px não cobre ${n - 1} espaçamentos`,
      ).toBeLessThan(0.5);
    }
  });

  it("sem espaçamento, a largura é a fração crua", () => {
    expect(larguraDoBloco(bloco(50), "desktop", 0).width).toBe("50%");
  });

  it("no celular volta para a linha inteira — 50% de 390px é coluna de duas palavras", () => {
    expect(larguraDoBloco(bloco(50), "mobile", 24)).toEqual({ width: "100%" });
  });

  it("mas respeita quem pediu para manter lado a lado no celular", () => {
    expect(larguraDoBloco(bloco(50, true), "mobile", 24).width).toBe("calc(50% - 12px)");
  });

  it("continua dividindo no tablet", () => {
    expect(larguraDoBloco(bloco(50), "tablet", 24).width).toBe("calc(50% - 12px)");
  });

  it("100% explícito não vira calc com desconto zero", () => {
    expect(larguraDoBloco(bloco(100), "desktop", 24)).toEqual({ width: "100%" });
  });

  it("não encolhe abaixo do conteúdo por acidente", () => {
    // `min-width: auto` é o padrão do item flex e desfaz a divisão quando o
    // conteúdo é largo.
    expect(larguraDoBloco(bloco(50), "desktop", 24).minWidth).toBe(0);
  });

  it("as opções do inspetor somam linhas inteiras", () => {
    for (const l of LARGURAS) {
      const porLinha = Math.round(100 / l.valor);
      expect(porLinha * l.valor).toBeGreaterThanOrEqual(99);
      expect(porLinha * l.valor).toBeLessThanOrEqual(100);
    }
  });
});

describe("etapaUsaFracao", () => {
  it("é falso quando ninguém divide linha", () => {
    expect(etapaUsaFracao([bloco(), bloco(100)])).toBe(false);
  });
  it("é verdadeiro assim que um bloco divide", () => {
    expect(etapaUsaFracao([bloco(), bloco(50)])).toBe(true);
  });
});
