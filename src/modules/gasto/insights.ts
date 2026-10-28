/**
 * Tradução do que a Meta devolve em `/insights` para linhas de `ad_spend_daily`.
 *
 * Puro de propósito (sem rede, sem banco): é aqui que os valores estranhos da
 * API — números como texto, campos ausentes, linha sem anúncio — são tratados, e
 * isso precisa ser testável sem chamar a Meta.
 */

export interface InsightBruto {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  account_currency?: string;
}

export interface LinhaDeGasto {
  ad_id: string;
  ad_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  dia: string;
  gasto: number;
  moeda: string;
  impressoes: number;
  cliques: number;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** A Meta manda número como texto ("12.34"); vazio ou lixo não pode virar NaN no banco. */
function numero(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Uma linha de insights → uma linha de gasto, ou `null` se não presta.
 *
 * Linha sem anúncio, sem dia ou sem gasto numérico é descartada em vez de
 * gravada com zero: zero diria "este anúncio não gastou", e a verdade é "a
 * resposta veio quebrada".
 */
export function normalizarInsight(row: InsightBruto, moedaPadrao = "BRL"): LinhaDeGasto | null {
  if (!row.ad_id || !row.date_start || !DIA.test(row.date_start)) return null;
  const gasto = numero(row.spend);
  if (gasto === null) return null;
  return {
    ad_id: row.ad_id,
    ad_name: row.ad_name ?? null,
    adset_id: row.adset_id ?? null,
    adset_name: row.adset_name ?? null,
    campaign_id: row.campaign_id ?? null,
    campaign_name: row.campaign_name ?? null,
    dia: row.date_start,
    gasto: Math.round(gasto * 100) / 100,
    moeda: (row.account_currency || moedaPadrao).toUpperCase(),
    impressoes: Math.trunc(numero(row.impressions) ?? 0),
    cliques: Math.trunc(numero(row.clicks) ?? 0),
  };
}

/** `YYYY-MM-DD` de hoje no fuso do negócio (São Paulo), não em UTC. */
export function hojeNoBrasil(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** Janela `[desde, ate]` de `dias` dias terminando hoje (inclusive). */
export function janelaDeDatas(dias: number, agora: Date = new Date()): { desde: string; ate: string } {
  const ate = hojeNoBrasil(agora);
  const n = Math.min(Math.max(Math.trunc(dias) || 1, 1), 365);
  const [y, m, d] = ate.split("-").map(Number);
  const inicio = new Date(Date.UTC(y, m - 1, d - (n - 1)));
  return { desde: inicio.toISOString().slice(0, 10), ate };
}

/** Quebra uma janela longa em pedaços, para cada chamada à Meta ficar pequena. */
export function fatiarJanela(
  desde: string,
  ate: string,
  diasPorFatia = 30,
): Array<{ desde: string; ate: string }> {
  const fatias: Array<{ desde: string; ate: string }> = [];
  const fim = Date.parse(`${ate}T00:00:00Z`);
  let cursor = Date.parse(`${desde}T00:00:00Z`);
  while (cursor <= fim) {
    const corte = Math.min(cursor + (diasPorFatia - 1) * 86400000, fim);
    fatias.push({
      desde: new Date(cursor).toISOString().slice(0, 10),
      ate: new Date(corte).toISOString().slice(0, 10),
    });
    cursor = corte + 86400000;
  }
  return fatias;
}
