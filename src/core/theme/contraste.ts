/**
 * Contraste calculado a partir dos tokens, para o teste poder reprovar sozinho.
 *
 * Sem isto, "o chip tem 4,89:1" é uma frase num commit: alguém escurece meio
 * ponto de luminosidade seis meses depois, ninguém mede, e o produto volta a
 * ficar abaixo do piso sem nada acusar. A conta precisa rodar no CI.
 *
 * A implementação é conferida contra o navegador no teste: as mesmas entradas
 * têm que devolver os mesmos números que o Chrome devolveu ao renderizar o CSS
 * compilado. Fórmula que não bate com a tela é fórmula errada, por mais certa
 * que pareça.
 */

export type Rgb = [number, number, number];

/** OKLCH → sRGB (0–255). Caminho padrão: OKLab, LMS, sRGB linear, gama. */
export function oklchParaRgb(L: number, C: number, Hgraus: number): Rgb {
  const h = (Hgraus * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const lineares = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  return lineares.map((v) => {
    const comGama = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.abs(v) ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, comGama)) * 255);
  }) as Rgb;
}

/**
 * `color-mix(in oklch, cor P%, transparent)` composto sobre um fundo opaco.
 *
 * Misturar com `transparent` não muda a cor: o CSS premultiplica, e como o
 * `transparent` entra com alfa zero ele não contribui componente nenhum. O que
 * sai é a mesma cor com alfa P. A composição sobre o fundo é em sRGB com gama,
 * que é onde o navegador compõe — compor em linear daria outro número.
 */
export function sobreFundo(cor: Rgb, alfa: number, fundo: Rgb): Rgb {
  return cor.map((c, i) => c * alfa + fundo[i] * (1 - alfa)) as Rgb;
}

/** Luminância relativa da WCAG 2.x. */
export function luminancia([r, g, b]: Rgb): number {
  const canal = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste da WCAG 2.x, de 1 a 21. */
export function razaoDeContraste(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Piso para texto normal (abaixo de 18,66px negrito / 24px). WCAG 1.4.3. */
export const PISO_TEXTO_NORMAL = 4.5;
