import { z } from "zod";
import { validarTelefone } from "@/modules/quiz/lib/telefone";

/**
 * Formato do lead na API e nos webhooks.
 *
 * A lista abaixo tem de ser IGUAL à de `public.lead_para_api` na migration: o
 * webhook sai do banco com aquela função, a API sai daqui. Um teste compara as
 * duas, para um campo novo não aparecer só de um lado.
 *
 * Fica de fora o que é interno ou identifica o visitante: gclid/fbclid,
 * metadata, device_info, location_info, assigned_to, cvcrm_id, sync_status.
 */
export const CAMPOS_PUBLICOS_DO_LEAD = [
  "id",
  "name",
  "email",
  "phone",
  "city",
  "status",
  "stage_id",
  "source",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "landing_page",
  "score",
  "temperature",
  "deal_value",
  "deal_currency",
  "external_id",
  "custom_fields",
  "created_at",
  "updated_at",
] as const;

export const SELECT_DO_LEAD = CAMPOS_PUBLICOS_DO_LEAD.join(",");

type Linha = Record<string, unknown>;

/** Linha do banco → objeto da API. Só os campos públicos, `numeric` como número. */
export function serializarLead(linha: Linha): Linha {
  const saida: Linha = {};
  for (const campo of CAMPOS_PUBLICOS_DO_LEAD) {
    let v = linha[campo];
    // `numeric` volta como string do PostgREST; a API promete número.
    if (campo === "deal_value" && v != null) v = Number(v);
    saida[campo] = v === undefined ? null : v;
  }
  return saida;
}

const texto = (max: number) => z.string().trim().min(1).max(max);

const telefone = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .superRefine((v, ctx) => {
    const aviso = validarTelefone(v);
    if (aviso) ctx.addIssue({ code: z.ZodIssueCode.custom, message: aviso });
  });

const valorDeCampo = z.union([z.string().max(500), z.number().finite(), z.null()]);

/** `strict`: campo desconhecido é erro, não é ignorado em silêncio (typo vira 400, não lead sem dado). */
const campos = {
  name: texto(200),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: telefone,
  city: texto(120),
  source: texto(80),
  utm_source: texto(200),
  utm_medium: texto(200),
  utm_campaign: texto(200),
  utm_content: texto(200),
  utm_term: texto(200),
  landing_page: z.string().trim().url().max(2000),
  external_id: texto(100),
  deal_value: z.number().finite().min(0).max(999_999_999_999),
  deal_currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
  stage_id: z.string().uuid(),
  custom_fields: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), valorDeCampo),
};

export const criarLeadSchema = z
  .object({
    name: campos.name.optional(),
    email: campos.email.optional(),
    phone: campos.phone.optional(),
    city: campos.city.optional(),
    source: campos.source.optional(),
    utm_source: campos.utm_source.optional(),
    utm_medium: campos.utm_medium.optional(),
    utm_campaign: campos.utm_campaign.optional(),
    utm_content: campos.utm_content.optional(),
    utm_term: campos.utm_term.optional(),
    landing_page: campos.landing_page.optional(),
    external_id: campos.external_id.optional(),
    deal_value: campos.deal_value.optional(),
    deal_currency: campos.deal_currency.optional(),
    stage_id: campos.stage_id.optional(),
    custom_fields: campos.custom_fields.optional(),
  })
  .strict()
  .refine((d) => Boolean(d.name || d.email || d.phone), {
    message: "informe ao menos name, email ou phone",
    path: [],
  });

/** Atualização: `null` limpa o campo; ausente não mexe. Contato e atribuição não mudam por aqui. */
export const atualizarLeadSchema = z
  .object({
    name: campos.name.nullable().optional(),
    email: campos.email.nullable().optional(),
    phone: campos.phone.nullable().optional(),
    city: campos.city.nullable().optional(),
    deal_value: campos.deal_value.nullable().optional(),
    deal_currency: campos.deal_currency.optional(),
    external_id: campos.external_id.nullable().optional(),
    stage_id: campos.stage_id.optional(),
    custom_fields: campos.custom_fields.optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, { message: "nada para atualizar", path: [] });

export type CriarLead = z.infer<typeof criarLeadSchema>;
export type AtualizarLead = z.infer<typeof atualizarLeadSchema>;

/** Mensagem curta e legível para o primeiro problema de validação. */
export function mensagemDeValidacao(erro: z.ZodError): string {
  const i = erro.issues[0];
  if (!i) return "requisição inválida";
  const caminho = i.path.join(".");
  if (i.code === "unrecognized_keys") return `campo desconhecido: ${i.keys.join(", ")}`;
  return caminho ? `${caminho}: ${i.message}` : i.message;
}

// --- Paginação por cursor -------------------------------------------------
//
// Ordem fixa (created_at desc, id desc) e cursor = o último par visto. Sem
// OFFSET: página 500 custa o mesmo que a 1, e lead criado no meio da leitura
// não desloca as páginas seguintes nem repete linha.

export interface Cursor {
  criadoEm: string;
  id: string;
}

export function codificarCursor(c: Cursor): string {
  return Buffer.from(`${c.criadoEm}|${c.id}`, "utf8").toString("base64url");
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodificarCursor(bruto: string | null | undefined): Cursor | null {
  if (!bruto) return null;
  let txt: string;
  try {
    txt = Buffer.from(bruto, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const i = txt.indexOf("|");
  if (i < 0) return null;
  const criadoEm = txt.slice(0, i);
  const id = txt.slice(i + 1);
  // ISO estrito, e não `Date.parse`: o V8 aceita "1 Jan 2026 (,id.gt.0)" e esse
  // texto vai para dentro de um filtro do PostgREST. Também preserva os
  // microssegundos do banco, que um `Date` truncaria (e quebraria o desempate).
  if (!ISO.test(criadoEm) || Number.isNaN(Date.parse(criadoEm)) || !UUID.test(id)) return null;
  return { criadoEm, id };
}

export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 100;

export function limiteDaPagina(bruto: string | null | undefined): number | null {
  if (bruto == null || bruto === "") return LIMITE_PADRAO;
  if (!/^\d{1,4}$/.test(bruto)) return null;
  const n = Number(bruto);
  return n >= 1 && n <= LIMITE_MAXIMO ? n : null;
}

/**
 * Filtro "depois deste cursor" para `.or()` do PostgREST. Só roda com cursor já
 * validado por `decodificarCursor` (ISO estrito + uuid), então nada do cliente
 * chega aqui com vírgula ou parêntese.
 */
export function filtroDoCursor(c: Cursor): string {
  return `created_at.lt.${c.criadoEm},and(created_at.eq.${c.criadoEm},id.lt.${c.id})`;
}
