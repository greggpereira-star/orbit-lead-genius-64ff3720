/**
 * Escolhe branco ou uma tinta escura pro texto de cima de `hex`, com base na
 * luminância relativa (fórmula WCAG) — evita texto ilegível quando `primary`
 * é uma cor clara (ex: dourado, coral).
 */
export function getContrastText(hex: string): string {
  const norm = normalizarHex(hex);
  if (!norm) return "#ffffff";
  // O corte por luminância fixa (0,45) escolhia branco em fundos de meio-tom — laranja,
  // verde e azul dos presets davam 2,5 a 2,8:1. Agora: branco enquanto ele passa do piso
  // de texto grande da WCAG (3:1; rótulo de botão é negrito e grande) — assim quem já
  // estava legível não muda de cara —, e só quando não passa vale o de maior contraste.
  const branco = contrasteWCAG(norm, "#ffffff");
  if (branco >= CONTRASTE_BOTAO_MINIMO) return "#ffffff";
  return contrasteWCAG(norm, "#1a1a1a") > branco ? "#1a1a1a" : "#ffffff";
}

/** `#rgb` ou `#rrggbb` válido vira `#rrggbb` minúsculo; qualquer outra coisa, `null`. */
export function normalizarHex(valor: string | undefined | null): string | null {
  const v = (valor ?? "").trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

/**
 * Normaliza as cores do tema para `#rrggbb`. Vários renderizadores anexam dois dígitos de
 * alfa (`${primary}cc`), que com `#f90` viram `#f90cc` — inválido, e o gradiente some.
 * Valor que não é hex (ex.: `red`) é mantido como está.
 */
export function normalizarCoresDoDesign<T extends { primary: string; background: string; surface: string; text: string; muted: string; titleColor?: string }>(d: T): T {
  const n = (v: string) => normalizarHex(v) ?? v;
  return { ...d, primary: n(d.primary), background: n(d.background), surface: n(d.surface), text: n(d.text), muted: n(d.muted), ...(d.titleColor ? { titleColor: n(d.titleColor) } : {}) };
}

/** Clareia `hex` em direção ao branco por `amount` (0-1). Usado pelos estilos de
 * botão com gradiente/relevo (ex.: topo mais claro de um botão "Cápsula"). */
export function lighten(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return rgbToHex(mix(rgb.r), mix(rgb.g), mix(rgb.b));
}

/** Escurece `hex` em direção ao preto por `amount` (0-1). Usado pra simular a
 * "borda inferior" de um botão 3D/relevo sem precisar de uma segunda cor configurável. */
export function darken(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const mix = (c: number) => Math.round(c * (1 - amount));
  return rgbToHex(mix(rgb.r), mix(rgb.g), mix(rgb.b));
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (c: number) => Math.max(0, Math.min(255, c));
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  // Estrito: `parseInt("12g456", 16)` devolvia 0x12 sem NaN e "aceitava" lixo parcial.
  const full = normalizarHex(hex)?.slice(1);
  if (!full) return null;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Mistura `a` com `b` em `t` (0 = só `a`, 1 = só `b`), sempre devolvendo hex.
 *
 * Hex de propósito: há renderizadores que anexam dois dígitos de alfa à cor do
 * tema (`${design.muted}66`), e isso só funciona com `#rrggbb`.
 */
export function mesclarHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return a;
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  return rgbToHex(m(ra.r, rb.r), m(ra.g, rb.g), m(ra.b, rb.b));
}

/** `hex` válido (#rgb ou #rrggbb)? */
export function ehHex(valor: string | undefined): valor is string {
  return !!valor && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(valor.trim());
}

/**
 * `hex` com transparência, em `rgb(r g b / a)`.
 *
 * O tema do quiz é hex puro, mas contorno e realce precisam de uma tinta que
 * acompanhe a cor escolhida sem virar mais um campo de configuração. Uma cinza
 * fixa brigaria com temas escuros ou coloridos; a mesma cor diluída, não.
 */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${alpha})`;
}

/**
 * Contraste WCAG entre duas cores em hex.
 *
 * Existe porque dois dos oito presets publicavam texto de apoio abaixo do piso
 * legível — Rose Luxe a 3,76:1 e Candy a 2,54:1, medidos no quiz do cliente no
 * ar em 07/10. Uma cor escolhida a olho numa paleta bonita vira texto que o
 * visitante não lê, e isso só aparece medindo.
 */
export function contrasteWCAG(a: string, b: string): number {
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const n =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    const canal = (i: number) => {
      const v = parseInt(n.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  };
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Piso da WCAG AA para texto grande/negrito (rótulo de botão). */
export const CONTRASTE_BOTAO_MINIMO = 3;

/** Piso da WCAG AA para texto normal. Texto grande (>=24px) pede 3:1. */
export const CONTRASTE_MINIMO = 4.5;
