/** Eventos de webhook da Cloud API, assinados como a Meta assina. Só ensaio. */
import { assinar } from "./meta-falsa.mjs";
import { META_APP_SECRET, WA_VERIFY_TOKEN } from "./chaves.mjs";

export const PNID = "PNID_TESTE";
const agora = () => String(Math.floor(Date.now() / 1000));
let n = 0;
export const novoWamid = (p = "CLIENTE") => `wamid.${p}${Date.now().toString(36)}${(n++).toString(36)}`;

const envelope = (campo, valor, waba = "WABA1") => ({ object: "whatsapp_business_account", entry: [{ id: waba, time: Number(agora()), changes: [{ field: campo, value: valor }] }] });
const meta = { display_phone_number: "5527900000000", phone_number_id: PNID };

export const eventos = {
  texto: ({ de, nome, texto, wamid = novoWamid(), ts = agora(), contexto, referral }) => envelope("messages", {
    messaging_product: "whatsapp", metadata: { ...meta },
    contacts: [{ profile: { name: nome }, wa_id: de }],
    messages: [{ from: de, id: wamid, timestamp: ts, type: "text", text: { body: texto }, ...(contexto ? { context: { id: contexto } } : {}), ...(referral ? { referral } : {}) }],
  }),
  midia: ({ de, nome, tipo = "image", mediaId, legenda, wamid = novoWamid(), mime = "image/jpeg" }) => envelope("messages", {
    messaging_product: "whatsapp", metadata: { ...meta },
    contacts: [{ profile: { name: nome }, wa_id: de }],
    messages: [{ from: de, id: wamid, timestamp: agora(), type: tipo, [tipo]: { id: mediaId, mime_type: mime, sha256: "x", ...(legenda ? { caption: legenda } : {}) } }],
  }),
  eco: ({ para, texto, wamid = novoWamid("NEGOCIO"), ts = agora() }) => envelope("smb_message_echoes", {
    messaging_product: "whatsapp", metadata: { ...meta },
    message_echoes: [{ from: meta.display_phone_number, to: para, id: wamid, timestamp: ts, type: "text", text: { body: texto } }],
  }),
  status: ({ wamid, status, para, ts = agora(), erro, categoria }) => envelope("messages", {
    messaging_product: "whatsapp", metadata: { ...meta },
    statuses: [{ id: wamid, status, timestamp: ts, recipient_id: para, ...(categoria ? { pricing: { billable: true, pricing_model: "CBP", category: categoria } } : {}),
      ...(erro ? { errors: [{ code: erro.code, title: erro.title, error_data: { details: erro.details ?? erro.title } }] } : {}) }],
  }),
  templateStatus: ({ waba = "WABA1", nome, idioma = "pt_BR", evento, motivo, id = "999" }) => envelope("message_template_status_update", {
    event: evento, message_template_id: id, message_template_name: nome, message_template_language: idioma, ...(motivo ? { reason: motivo } : {}),
  }, waba),
  conta: ({ waba = "WABA1", evento, motivo }) => envelope("account_update", { event: evento, phone_number: meta.display_phone_number, ...(motivo ? { disconnection_info: { reason: motivo } } : {}) }, waba),
  historico: ({ cliente, mensagens, progresso = 50, fase = 0 }) => envelope("history", {
    messaging_product: "whatsapp", metadata: { ...meta },
    history: [{ metadata: { phase: fase, chunk_order: 1, progress: progresso }, threads: [{ id: cliente, messages: mensagens }] }],
  }),
  campoDesconhecido: () => envelope("alguma_coisa_nova", { qualquer: "coisa" }),
};

/** Envia um corpo à rota real, assinado com o segredo do ensaio (ou com um errado). */
export async function enviar(base, corpo, { segredo = META_APP_SECRET, semAssinatura = false, cabecalhos = {} } = {}) {
  const cru = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  const r = await fetch(`${base}/api/public/wa-webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(semAssinatura ? {} : { "x-hub-signature-256": assinar(cru, segredo) }), ...cabecalhos },
    body: cru,
  });
  return { status: r.status, texto: await r.text() };
}
export const verificar = async (base, { token = WA_VERIFY_TOKEN, desafio = "12345", modo = "subscribe" } = {}) => {
  const r = await fetch(`${base}/api/public/wa-webhook?hub.mode=${modo}&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=${desafio}`);
  return { status: r.status, texto: await r.text() };
};
