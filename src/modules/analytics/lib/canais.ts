/**
 * Canais de origem do lead (o que a tela mostra).
 *
 * `canal_do_lead` no banco DERIVA o canal; as listas abaixo só dão nome a ele e
 * dizem quais a equipe pode ATRIBUIR. Um teste compara `CANAIS_ATRIBUIVEIS` com o
 * CHECK da migration, para a tela não oferecer um canal que o banco recusa.
 */
export const CANAIS_ATRIBUIVEIS = [
  "meta_anuncio",
  "google_anuncio",
  "instagram_organico",
  "site_organico",
  "indicacao",
  "whatsapp_direto",
  "presencial",
  "outro",
] as const;
export type CanalAtribuivel = (typeof CANAIS_ATRIBUIVEIS)[number];

export const NAO_RASTREADO = "nao_rastreado";

export const ROTULO_DO_CANAL: Record<string, string> = {
  meta_anuncio: "Anúncio da Meta",
  google_anuncio: "Anúncio do Google",
  whatsapp_anuncio: "Anúncio no WhatsApp",
  link_rastreado: "Link rastreado",
  quiz: "Quiz",
  formulario: "Formulário",
  api: "API",
  utm_outro: "Outra campanha (UTM)",
  instagram_organico: "Instagram (orgânico)",
  site_organico: "Site (orgânico)",
  indicacao: "Indicação",
  whatsapp_direto: "WhatsApp direto",
  presencial: "Presencial",
  outro: "Outro",
  nao_rastreado: "Não rastreado",
};

export const rotuloDoCanal = (canal: string): string => ROTULO_DO_CANAL[canal] ?? canal;

export interface FatiaDeCanal {
  canal: string;
  leads: number;
  /** 0–100, uma casa. */
  percentual: number;
}

/** Percentual de cada canal sobre o total; total zero não divide por zero. */
export function fatiasDeCanal(linhas: Array<{ canal: string; leads: number | string }>): {
  total: number;
  fatias: FatiaDeCanal[];
  naoRastreados: number;
  percentualNaoRastreado: number;
} {
  const limpas = linhas.map((l) => ({ canal: l.canal, leads: Number(l.leads) || 0 }));
  const total = limpas.reduce((s, l) => s + l.leads, 0);
  const fatias = limpas
    .filter((l) => l.leads > 0)
    .sort((a, b) => b.leads - a.leads || a.canal.localeCompare(b.canal))
    .map((l) => ({
      ...l,
      percentual: total > 0 ? Math.round((l.leads / total) * 1000) / 10 : 0,
    }));
  const nao = fatias.find((f) => f.canal === NAO_RASTREADO);
  return {
    total,
    fatias,
    naoRastreados: nao?.leads ?? 0,
    percentualNaoRastreado: nao?.percentual ?? 0,
  };
}
