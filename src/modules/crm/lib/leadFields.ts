/**
 * Extrai da linha de lead as informações que o usuário realmente quer ver.
 *
 * O `metadata` de cada lead guarda, junto com dados internos, as respostas do
 * formulário e o nome do formulário de origem — que, numa imobiliária, é o
 * empreendimento. Nada disso aparecia em lugar nenhum da interface.
 */
import type { LeadRow } from "../services/leadService";

type Meta = Record<string, unknown>;

function meta(lead: LeadRow): Meta {
  const m = (lead as { metadata?: unknown }).metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Meta) : {};
}

/**
 * Chaves de controle do metadata. Tudo que sobra é resposta de formulário —
 * assim funciona pra qualquer nicho sem precisar cadastrar campo por campo.
 */
const INTERNAL_KEYS = new Set([
  "channel", "stage_id", "mapping_id", "pipeline_id", "default_tags",
  "qualification_rules", "meta_ad_id", "meta_form_id", "meta_page_id",
  "meta_adset_id", "meta_form_name", "meta_leadgen_id", "meta_campaign_id",
  "meta_created_time", "quiz_id", "quiz_slug", "quiz_title", "submission_id",
  "visitor_id", "company_name", "source", "utm_source", "utm_medium",
  "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid",
]);

/**
 * "qual_sua_faixa_de_investimento?" → "Qual sua faixa de investimento?"
 * As chaves vêm do Meta com espaços virando underscore e tudo em minúsculo.
 */
export function humanizeKey(key: string): string {
  const text = key.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return key;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "até_r$700_mil" → "Até R$700 mil". Reaproveita a mesma normalização e
 * corrige "r$" que ficaria "R$" no meio da frase.
 */
export function humanizeValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (Array.isArray(value)) return value.map((v) => humanizeValue(v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);

  const raw = String(value).trim();
  if (!raw) return "—";
  const text = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  const capitalized = text.charAt(0).toUpperCase() + text.slice(1);
  return capitalized.replace(/\br\$/gi, "R$");
}

export interface LeadAnswer {
  key: string;
  label: string;
  value: string;
}

/** Respostas do formulário/quiz, prontas pra exibir. */
export function getLeadAnswers(lead: LeadRow): LeadAnswer[] {
  const m = meta(lead);
  return Object.entries(m)
    .filter(([k, v]) => !INTERNAL_KEYS.has(k) && v !== null && v !== "" && !Array.isArray(v))
    .map(([k, v]) => ({ key: k, label: humanizeKey(k), value: humanizeValue(v) }));
}

/**
 * A "origem" do lead — nome do formulário do Meta ou do quiz.
 *
 * É o campo que numa imobiliária significa "empreendimento", numa clínica
 * "procedimento" e numa escola "curso". Por isso o rótulo da coluna é
 * configurável, mas o dado é sempre este.
 */
export function getLeadOrigin(lead: LeadRow): string | null {
  const m = meta(lead);
  const candidates = [m.meta_form_name, m.quiz_title, m.quiz_slug];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

/** Canal de captação (meta_lead_ads, quiz, manual…), para ícone e filtro. */
export function getLeadChannel(lead: LeadRow): string {
  const m = meta(lead);
  if (typeof m.channel === "string" && m.channel) return m.channel;
  return (lead as { source?: string | null }).source || "direct";
}

// -------------------------------------------------------------------
// Cidade por DDD
// -------------------------------------------------------------------

/**
 * O formulário do Meta não pergunta cidade — o campo vinha vazio em 100% dos
 * leads. O DDD do telefone dá a região sem precisar pedir nada a mais, e
 * funciona retroativamente. Quando o formulário informar a cidade de verdade,
 * ela tem prioridade sobre esta dedução.
 */
const DDD_MAP: Record<string, string> = {
  "11": "São Paulo, SP", "12": "São José dos Campos, SP", "13": "Santos, SP",
  "14": "Bauru, SP", "15": "Sorocaba, SP", "16": "Ribeirão Preto, SP",
  "17": "São José do Rio Preto, SP", "18": "Presidente Prudente, SP",
  "19": "Campinas, SP",
  "21": "Rio de Janeiro, RJ", "22": "Campos dos Goytacazes, RJ", "24": "Volta Redonda, RJ",
  "27": "Vitória, ES", "28": "Cachoeiro de Itapemirim, ES",
  "31": "Belo Horizonte, MG", "32": "Juiz de Fora, MG", "33": "Governador Valadares, MG",
  "34": "Uberlândia, MG", "35": "Poços de Caldas, MG", "37": "Divinópolis, MG",
  "38": "Montes Claros, MG",
  "41": "Curitiba, PR", "42": "Ponta Grossa, PR", "43": "Londrina, PR",
  "44": "Maringá, PR", "45": "Foz do Iguaçu, PR", "46": "Francisco Beltrão, PR",
  "47": "Joinville, SC", "48": "Florianópolis, SC", "49": "Chapecó, SC",
  "51": "Porto Alegre, RS", "53": "Pelotas, RS", "54": "Caxias do Sul, RS",
  "55": "Santa Maria, RS",
  "61": "Brasília, DF", "62": "Goiânia, GO", "63": "Palmas, TO",
  "64": "Rio Verde, GO", "65": "Cuiabá, MT", "66": "Rondonópolis, MT",
  "67": "Campo Grande, MS", "68": "Rio Branco, AC", "69": "Porto Velho, RO",
  "71": "Salvador, BA", "73": "Itabuna, BA", "74": "Juazeiro, BA",
  "75": "Feira de Santana, BA", "77": "Barreiras, BA", "79": "Aracaju, SE",
  "81": "Recife, PE", "82": "Maceió, AL", "83": "João Pessoa, PB",
  "84": "Natal, RN", "85": "Fortaleza, CE", "86": "Teresina, PI",
  "87": "Petrolina, PE", "88": "Juazeiro do Norte, CE", "89": "Picos, PI",
  "91": "Belém, PA", "92": "Manaus, AM", "93": "Santarém, PA",
  "94": "Marabá, PA", "95": "Boa Vista, RR", "96": "Macapá, AP",
  "97": "Coari, AM", "98": "São Luís, MA", "99": "Imperatriz, MA",
};

export function cityFromPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D+/g, "");
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  if (digits.length < 10) return null;
  return DDD_MAP[digits.slice(0, 2)] ?? null;
}

export interface LeadCity {
  label: string;
  /** true quando veio do DDD, não de um campo preenchido pelo lead. */
  inferred: boolean;
}

export function getLeadCity(lead: LeadRow): LeadCity | null {
  const real = (lead as { city?: string | null }).city;
  if (typeof real === "string" && real.trim()) {
    return { label: real.trim(), inferred: false };
  }
  const guess = cityFromPhone((lead as { phone?: string | null }).phone);
  return guess ? { label: guess, inferred: true } : null;
}

/** Data e hora do cadastro — antes só a data aparecia. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

/** "há 3 min" / "ontem" — leitura rápida de quão fresco é o lead. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const minutes = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  return "";
}

/** Link de WhatsApp já normalizado — ação mais usada sobre um lead novo. */
export function whatsappLink(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D+/g, "");
  digits = digits.replace(/^0+/, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 12) return null;
  return `https://wa.me/${digits}`;
}
