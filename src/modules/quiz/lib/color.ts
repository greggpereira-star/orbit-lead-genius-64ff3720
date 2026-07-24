/**
 * Escolhe branco ou uma tinta escura pro texto de cima de `hex`, com base na
 * luminância relativa (fórmula WCAG) — evita texto ilegível quando `primary`
 * é uma cor clara (ex: dourado, coral).
 */
export function getContrastText(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#ffffff';
  const luminance = relativeLuminance(rgb);
  return luminance > 0.45 ? '#1a1a1a' : '#ffffff';
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
  return `#${[r, g, b].map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (full.length !== 6) return null;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
