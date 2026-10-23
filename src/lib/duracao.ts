/**
 * Duração para ler de relance: só horas e minutos, nunca "1246 min".
 *
 *   0       → "menos de 1 min"
 *   45      → "45 min"
 *   180     → "3 h"
 *   1246    → "20 h 46 min"
 *   1500    → "25 h"          (sem dias de propósito: o padrão é um só)
 */
export function duracaoCurta(minutos: number | string | null | undefined): string {
  const n = Math.floor(Number(minutos));
  if (!Number.isFinite(n) || n < 1) return "menos de 1 min";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
