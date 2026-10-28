/**
 * Período único da página de Analytics.
 *
 * Antes cada card guardava o próprio seletor: mudar o do topo não mudava o custo por
 * lead de baixo, e o leitor comparava 7 dias com 30 sem perceber. Agora há UM período,
 * guardado na URL (`?dias=7`): vale para a página inteira e dá para mandar o link.
 */
export const PERIODOS = [
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
  { valor: "365", rotulo: "Último ano" },
] as const;

export type Periodo = (typeof PERIODOS)[number]["valor"];
export const PERIODO_PADRAO: Periodo = "30";

/** Qualquer coisa vinda da URL vira um período válido; lixo cai no padrão. */
export function normalizarPeriodo(bruto: unknown): Periodo {
  const v = String(bruto ?? "");
  return PERIODOS.some((p) => p.valor === v) ? (v as Periodo) : PERIODO_PADRAO;
}

export function rotuloDoPeriodo(p: Periodo): string {
  return PERIODOS.find((x) => x.valor === p)?.rotulo ?? p;
}

/** "nos últimos 30 dias" / "no último ano": para frases como "leads criados …". */
export function fraseDoPeriodo(p: Periodo): string {
  return p === "365" ? "no último ano" : `nos últimos ${p} dias`;
}

/** Na URL o período é número (`?dias=30`); texto que parece número viria com aspas (`%2230%22`). */
export type PeriodoNaUrl = 7 | 30 | 90 | 365;
export const periodoParaUrl = (p: Periodo): PeriodoNaUrl => Number(p) as PeriodoNaUrl;
export const periodoDaUrl = (n: PeriodoNaUrl | undefined): Periodo => normalizarPeriodo(n);
