/**
 * Operações de lead da API pública. As rotas só autenticam e delegam para cá.
 *
 * Tudo filtra por `company_id` da CHAVE — a empresa nunca vem do corpo nem da URL.
 * Lead de outra empresa responde 404, igual a lead que não existe: o status não
 * pode servir para descobrir ids alheios.
 */
import { resolveEntryStageId } from "../entry-stage.server";
import { statusDaEtapa } from "../etiqueta-para-etapa.server";
import { erroDaApi, lerJson, resposta, type ContextoDaApi } from "../apiPublica.server";
import {
  mesclarCampos,
  validarCamposPersonalizados,
  type DefinicaoDeCampoApi,
} from "./camposPersonalizados";
import {
  SELECT_DO_LEAD,
  atualizarLeadSchema,
  codificarCursor,
  criarLeadSchema,
  decodificarCursor,
  filtroDoCursor,
  limiteDaPagina,
  mensagemDeValidacao,
  serializarLead,
} from "./leads";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAVE_DE_IDEMPOTENCIA = /^[\x21-\x7E]{1,128}$/;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2}))?$/;

const indisponivel = () => erroDaApi(503, "unavailable", "Serviço indisponível. Tente novamente.");
const naoEncontrado = () => erroDaApi(404, "not_found", "Lead não encontrado.");

interface Etapa {
  id: string;
  kind: string | null;
  name: string;
}

async function etapasDaEmpresa(admin: Admin, companyId: string): Promise<Etapa[] | null> {
  const { data, error } = await admin
    .from("stages")
    .select("id, kind, name")
    .eq("company_id", companyId)
    .order("order_index", { ascending: true });
  return error ? null : (data as Etapa[]);
}

async function definicoesDeCampos(
  admin: Admin,
  companyId: string,
): Promise<DefinicaoDeCampoApi[] | null> {
  const { data, error } = await admin
    .from("custom_field_defs")
    .select("key, label, type, options")
    .eq("company_id", companyId)
    .eq("active", true);
  if (error) return null;
  return (data ?? []).map((d: any) => ({
    key: d.key,
    label: d.label,
    type: d.type,
    options: Array.isArray(d.options) ? d.options.map(String) : [],
  }));
}

// --- GET /leads -----------------------------------------------------------

export async function listarLeads(admin: Admin, ctx: ContextoDaApi, url: URL): Promise<Response> {
  const q = url.searchParams;

  const limite = limiteDaPagina(q.get("limit"));
  if (limite === null)
    return erroDaApi(400, "invalid_parameter", "limit deve ser um inteiro de 1 a 100.");

  const cursor = q.get("cursor") ? decodificarCursor(q.get("cursor")) : null;
  if (q.get("cursor") && !cursor) return erroDaApi(400, "invalid_cursor", "cursor inválido.");

  const stageId = q.get("stage_id");
  if (stageId && !UUID.test(stageId))
    return erroDaApi(400, "invalid_parameter", "stage_id deve ser um uuid.");

  const desde = q.get("created_since");
  if (desde && (!DATA_ISO.test(desde) || Number.isNaN(Date.parse(desde)))) {
    return erroDaApi(400, "invalid_parameter", "created_since deve ser uma data ISO 8601.");
  }

  const externalId = q.get("external_id");
  const email = q.get("email");

  let consulta = admin
    .from("leads")
    .select(SELECT_DO_LEAD)
    .eq("company_id", ctx.companyId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limite + 1);

  if (stageId) consulta = consulta.eq("stage_id", stageId);
  if (desde) consulta = consulta.gte("created_at", desde);
  if (externalId) consulta = consulta.eq("external_id", externalId);
  // `ilike` sem curinga: escapa % _ \ para o e-mail casar literalmente.
  if (email)
    consulta = consulta.ilike(
      "email",
      email.replace(/[\\%_]/g, (c) => `\\${c}`),
    );
  if (cursor) consulta = consulta.or(filtroDoCursor(cursor));

  const { data, error } = await consulta;
  if (error) return indisponivel();

  const linhas = (data ?? []) as Record<string, unknown>[];
  const temMais = linhas.length > limite;
  const pagina = temMais ? linhas.slice(0, limite) : linhas;
  const ultimo = pagina[pagina.length - 1];

  return resposta({
    data: pagina.map(serializarLead),
    has_more: temMais,
    next_cursor:
      temMais && ultimo
        ? codificarCursor({ criadoEm: String(ultimo.created_at), id: String(ultimo.id) })
        : null,
  });
}

// --- GET /leads/:id -------------------------------------------------------

export async function buscarLead(admin: Admin, ctx: ContextoDaApi, id: string): Promise<Response> {
  if (!UUID.test(id)) return naoEncontrado();
  const { data, error } = await admin
    .from("leads")
    .select(SELECT_DO_LEAD)
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .maybeSingle();
  if (error) return indisponivel();
  if (!data) return naoEncontrado();
  return resposta({ data: serializarLead(data) });
}

// --- POST /leads ----------------------------------------------------------

export async function criarLead(
  admin: Admin,
  ctx: ContextoDaApi,
  request: Request,
): Promise<Response> {
  const corpo = await lerJson(request);
  if (!corpo.ok) return corpo.resposta;

  const parsed = criarLeadSchema.safeParse(corpo.valor);
  if (!parsed.success) {
    return erroDaApi(400, "invalid_request", mensagemDeValidacao(parsed.error));
  }
  const d = parsed.data;

  // Idempotência: a mesma chave devolve o mesmo lead. Sem isto, um timeout no
  // cliente seguido de nova tentativa cria o lead duas vezes.
  const chave = request.headers.get("idempotency-key");
  if (chave !== null && !CHAVE_DE_IDEMPOTENCIA.test(chave)) {
    return erroDaApi(
      400,
      "invalid_idempotency_key",
      "Idempotency-Key deve ter de 1 a 128 caracteres ASCII visíveis.",
    );
  }
  const eventId = chave ? `api:${chave}` : null;

  if (eventId) {
    const { data: existente, error } = await admin
      .from("leads")
      .select(SELECT_DO_LEAD)
      .eq("company_id", ctx.companyId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (error) return indisponivel();
    if (existente)
      return resposta({ data: serializarLead(existente) }, 200, { "idempotent-replay": "true" });
  }

  const etapas = await etapasDaEmpresa(admin, ctx.companyId);
  if (!etapas) return indisponivel();
  if (d.stage_id) {
    const alvo = etapas.find((e) => e.id === d.stage_id);
    if (!alvo) return erroDaApi(422, "invalid_stage", "stage_id não pertence a esta empresa.");
    if (alvo.kind !== "open") {
      return erroDaApi(
        422,
        "invalid_stage",
        "Crie o lead em uma etapa aberta e mova depois para ganho ou perda.",
      );
    }
  }
  const stageId = await resolveEntryStageId(admin, ctx.companyId, d.stage_id ?? null);
  const etapa = etapas.find((e) => e.id === stageId) ?? null;

  let customFields: Record<string, unknown> = {};
  if (d.custom_fields) {
    const defs = await definicoesDeCampos(admin, ctx.companyId);
    if (!defs) return indisponivel();
    const r = validarCamposPersonalizados(d.custom_fields, defs);
    if (!r.ok) return erroDaApi(422, "invalid_custom_field", r.erro);
    customFields = mesclarCampos({}, r);
  }

  const agora = new Date();
  const linha = {
    company_id: ctx.companyId,
    name: d.name ?? "Lead sem nome",
    email: d.email ?? null,
    phone: d.phone ?? null,
    city: d.city ?? null,
    source: d.source ?? "api",
    utm_source: d.utm_source ?? null,
    utm_medium: d.utm_medium ?? null,
    utm_campaign: d.utm_campaign ?? null,
    utm_content: d.utm_content ?? null,
    utm_term: d.utm_term ?? null,
    landing_page: d.landing_page ?? null,
    external_id: d.external_id ?? null,
    ...(d.deal_value !== undefined ? { deal_value: d.deal_value } : {}),
    ...(d.deal_currency ? { deal_currency: d.deal_currency } : {}),
    custom_fields: customFields,
    stage_id: stageId,
    stage_entered_at: agora.toISOString(),
    status: etapa ? statusDaEtapa(etapa, etapas) : "new",
    // Negativo = topo da coluna, como os demais caminhos de entrada.
    board_order: -agora.getTime(),
    event_id: eventId,
    metadata: { origem: "api", api_key_id: ctx.keyId },
  };

  const { data: criado, error } = await admin
    .from("leads")
    .insert(linha)
    .select(SELECT_DO_LEAD)
    .single();
  if (error) {
    // Duas requisições simultâneas com a mesma Idempotency-Key: a segunda perde
    // no índice único e devolve o lead da primeira.
    if (eventId && (error as { code?: string }).code === "23505") {
      const { data: existente } = await admin
        .from("leads")
        .select(SELECT_DO_LEAD)
        .eq("company_id", ctx.companyId)
        .eq("event_id", eventId)
        .maybeSingle();
      if (existente)
        return resposta({ data: serializarLead(existente) }, 200, { "idempotent-replay": "true" });
    }
    console.error(
      JSON.stringify({
        scope: "api-publica",
        msg: "criar_lead_falhou",
        company_id: ctx.companyId,
        erro: error.message,
      }),
    );
    return indisponivel();
  }

  await admin
    .from("lead_events")
    .insert({
      lead_id: criado.id,
      event_type: "api_created",
      description: `Criado pela API (chave "${ctx.keyNome}")`,
      metadata: { api_key_id: ctx.keyId },
    })
    .then(
      () => {},
      () => {},
    );

  return resposta({ data: serializarLead(criado) }, 201);
}

// --- PATCH /leads/:id -----------------------------------------------------

export async function atualizarLead(
  admin: Admin,
  ctx: ContextoDaApi,
  id: string,
  request: Request,
): Promise<Response> {
  if (!UUID.test(id)) return naoEncontrado();

  const corpo = await lerJson(request);
  if (!corpo.ok) return corpo.resposta;
  const parsed = atualizarLeadSchema.safeParse(corpo.valor);
  if (!parsed.success) return erroDaApi(400, "invalid_request", mensagemDeValidacao(parsed.error));
  const d = parsed.data;

  const { data: atual, error: erroLeitura } = await admin
    .from("leads")
    .select("id, stage_id, status, deal_value, custom_fields")
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .maybeSingle();
  if (erroLeitura) return indisponivel();
  if (!atual) return naoEncontrado();

  const mudanca: Record<string, unknown> = {};
  for (const campo of [
    "name",
    "email",
    "phone",
    "city",
    "deal_value",
    "deal_currency",
    "external_id",
  ] as const) {
    if (d[campo] !== undefined) mudanca[campo] = d[campo];
  }

  if (d.custom_fields) {
    const defs = await definicoesDeCampos(admin, ctx.companyId);
    if (!defs) return indisponivel();
    const r = validarCamposPersonalizados(d.custom_fields, defs);
    if (!r.ok) return erroDaApi(422, "invalid_custom_field", r.erro);
    mudanca.custom_fields = mesclarCampos(atual.custom_fields, r);
  }

  let etapaNova: Etapa | null = null;
  let etapaAnterior: Etapa | null = null;
  if (d.stage_id && d.stage_id !== atual.stage_id) {
    const etapas = await etapasDaEmpresa(admin, ctx.companyId);
    if (!etapas) return indisponivel();
    etapaNova = etapas.find((e) => e.id === d.stage_id) ?? null;
    if (!etapaNova) return erroDaApi(422, "invalid_stage", "stage_id não pertence a esta empresa.");
    etapaAnterior = etapas.find((e) => e.id === atual.stage_id) ?? null;
    Object.assign(mudanca, {
      stage_id: etapaNova.id,
      stage_entered_at: new Date().toISOString(),
      status: statusDaEtapa(etapaNova, etapas),
      board_order: -Date.now(),
      // Sair de uma etapa de perda limpa o motivo; entrar nela por aqui não traz motivo.
      loss_reason_id: null,
      lost_notes: null,
    });
  }

  const { data: atualizado, error } = await admin
    .from("leads")
    .update(mudanca)
    .eq("company_id", ctx.companyId)
    .eq("id", id)
    .select(SELECT_DO_LEAD)
    .maybeSingle();
  if (error) {
    console.error(
      JSON.stringify({
        scope: "api-publica",
        msg: "atualizar_lead_falhou",
        company_id: ctx.companyId,
        erro: error.message,
      }),
    );
    return indisponivel();
  }
  if (!atualizado) return naoEncontrado();

  if (etapaNova) {
    await admin
      .from("lead_events")
      .insert({
        lead_id: id,
        event_type: "stage_change",
        description: `Movido de ${etapaAnterior?.name ?? "Sem etapa"} para ${etapaNova.name} (API)`,
        metadata: { to_stage_id: etapaNova.id, api_key_id: ctx.keyId },
      })
      .then(
        () => {},
        () => {},
      );
  }

  // Mesmo gatilho do app: lead ganho (ou valor da venda mudando num lead já
  // ganho) vira conversão de venda no Google Ads. Sem isto, fechar pela API
  // deixaria a venda de fora do Google sem aviso.
  const ganhou = etapaNova?.kind === "won";
  const valorMudou =
    d.deal_value !== undefined && Number(d.deal_value) !== Number(atual.deal_value);
  if (ganhou || (atualizado.status === "won" && valorMudou)) {
    void import("../google-ads.functions")
      .then((m) => m.despacharConversaoVenda(id))
      .catch((e) =>
        console.error(
          JSON.stringify({ scope: "api-publica", msg: "conversao_venda_falhou", erro: String(e) }),
        ),
      );
  }

  return resposta({ data: serializarLead(atualizado) });
}
