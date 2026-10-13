import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  oklchParaRgb,
  sobreFundo,
  razaoDeContraste,
  PISO_TEXTO_NORMAL,
  type Rgb,
} from "./contraste";

/**
 * O selo de condicional, o de publicado e os outros chips põem texto da cor
 * cheia sobre um fundo de 12% da MESMA cor. É o padrão mais usado do produto e
 * o mais fácil de deixar ilegível, porque fundo e texto andam juntos: clarear
 * a cor clareia os dois, e a razão entre eles cai sem que nada pareça errado.
 *
 * Medido em 13/10 no navegador, com o CSS compilado: dava 4,20:1 no aviso e
 * 4,19:1 no sucesso, com letra de 9px. Abaixo do piso de 4,5:1.
 *
 * Este teste recalcula a partir do `styles.css`. Não é captura de valor: se
 * alguém clarear um token, a conta cai e isto reprova.
 */
const css = readFileSync("src/styles.css", "utf8");

const BRANCO: Rgb = [255, 255, 255];
const PRETO: Rgb = [0, 0, 0];
/** Proporção do `color-mix` que gera os fundos `-suave`. */
const TINTA_SUAVE = 0.12;

/** Lê `--nome: oklch(L C H)` do bloco pedido. */
const token = (bloco: ":root" | ".dark", nome: string): Rgb => {
  const i = css.indexOf(`${bloco} {`);
  if (i < 0) throw new Error(`não achei o bloco ${bloco}`);
  const fim = bloco === ":root" ? css.indexOf(".dark {") : css.length;
  const trecho = css.slice(i, fim > i ? fim : css.length);
  const m = trecho.match(
    new RegExp(`--${nome}\\s*:\\s*oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s*\\)`),
  );
  if (!m) throw new Error(`não achei --${nome} em oklch dentro de ${bloco}`);
  return oklchParaRgb(Number(m[1]), Number(m[2]), Number(m[3]));
};

describe("a fórmula bate com o que o navegador renderizou", () => {
  /**
   * Conferência contra a realidade. Estes números saíram do Chrome medindo o
   * CSS compilado em 13/10, lendo o pixel de um canvas. Se a conversão
   * oklch→sRGB daqui divergir, é a conta que está errada — e todo o resto
   * deste arquivo estaria medindo o nada.
   */
  it("reproduz as cores antigas, em hexadecimal", () => {
    const hex = (c: Rgb) =>
      "#" +
      c
        .map((v) => Math.round(v).toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    expect(hex(oklchParaRgb(0.555, 0.137, 62))).toBe("#AA5C00");
    expect(hex(oklchParaRgb(0.52, 0.145, 163))).toBe("#008150");
  });

  it("reproduz as razões medidas na tela, antes e depois", () => {
    const chip = (L: number, C: number, H: number) => {
      const cor = oklchParaRgb(L, C, H);
      return razaoDeContraste(cor, sobreFundo(cor, TINTA_SUAVE, BRANCO));
    };
    expect(chip(0.555, 0.137, 62)).toBeCloseTo(4.2, 1); // aviso, antes
    expect(chip(0.515, 0.137, 62)).toBeCloseTo(4.89, 1); // aviso, depois
    expect(chip(0.52, 0.145, 163)).toBeCloseTo(4.19, 1); // sucesso, antes
    expect(chip(0.48, 0.145, 163)).toBeCloseTo(4.84, 1); // sucesso, depois
    expect(razaoDeContraste(PRETO, oklchParaRgb(0.555, 0.137, 62))).toBeCloseTo(4.24, 1);
  });
});

describe("chips do tema claro alcançam o piso", () => {
  for (const nome of ["aviso", "sucesso"]) {
    it(`${nome}: texto da cor sobre o próprio fundo de 12%`, () => {
      const cor = token(":root", nome);
      const razao = razaoDeContraste(cor, sobreFundo(cor, TINTA_SUAVE, BRANCO));
      expect(razao, `--${nome} deu ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        PISO_TEXTO_NORMAL,
      );
    });
  }
});

describe("texto sobre o token sólido", () => {
  /**
   * O selo de "Preview (rascunho)" fica sobre `--aviso` cheio. Usava texto
   * PRETO, que dava 4,24:1 já antes de o token mudar — defeito que só apareceu
   * porque esta varredura olhou também este caso, e não só o do chip.
   */
  it("branco sobre aviso passa, e é por isso que o selo de preview usa branco", () => {
    expect(razaoDeContraste(BRANCO, token(":root", "aviso"))).toBeGreaterThanOrEqual(
      PISO_TEXTO_NORMAL,
    );
  });

  it("o selo de preview não voltou para texto preto", () => {
    const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
    const i = player.indexOf("bg-[var(--aviso)]");
    expect(i, "não achei o selo de preview").toBeGreaterThan(0);
    expect(player.slice(i, i + 120)).not.toContain("text-black");
  });
});

describe("chips do tema escuro alcançam o piso", () => {
  for (const nome of ["aviso", "sucesso"]) {
    it(`${nome}: sobre a superfície escura`, () => {
      // No escuro o fundo do chip é a cor a 12% sobre `--background` escuro.
      const fundo = token(".dark", "background");
      const cor = token(".dark", nome);
      const razao = razaoDeContraste(cor, sobreFundo(cor, TINTA_SUAVE, fundo));
      expect(razao, `--${nome} no escuro deu ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        PISO_TEXTO_NORMAL,
      );
    });
  }
});
