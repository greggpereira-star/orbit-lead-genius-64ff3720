/**
 * Ensaio: mensagem inbound de número cujo lead guarda o telefone COM máscara
 * ("(27) 99999-0011") tem que ligar contato e conversa ao lead.
 * Regressão do bug medido em produção em 28/10/2026 (6 de 643 leads).
 *
 *   node scripts/ensaio-local/e2e-lead-mascarado.mjs     (app em http://localhost:8082)
 */
import postgres from "postgres";
import { eventos, enviar, novoWamid } from "./webhooks.mjs";

const APP = process.env.APP ?? "http://localhost:8082";
const PG = process.env.ENSAIO_PG ?? "postgres://postgres@127.0.0.1:54329/leadflow_ensaio";
if (!/@127\.0\.0\.1:|@localhost:/.test(PG)) throw new Error("Recuso rodar fora de 127.0.0.1.");
const sql = postgres(PG, { onnotice: () => {}, max: 2 });
const [{ id: EMPRESA }] = await sql`select id from companies where slug = 'empresa-ensaio'`;

const casos = [
  { wa: "5527999990011", phone: "(27) 99999-0011", nome: "Mascarado" },
  { wa: "5527999990022", phone: "27 99999-0022", nome: "Espaco" },
  { wa: "5527999990033", phone: "+5527999990033", nome: "Meta" },
  { wa: "5527999990044", phone: "27999990044", nome: "SoDigitos" },
  { wa: "5527999990055", phone: "(11) 99999-0055", nome: "DddDiferente", esperaLigar: false },
];
await sql`truncate wa_media, wa_messages, wa_conversations, wa_contacts, wa_webhook_events restart identity cascade`;
await sql`delete from leads where company_id = ${EMPRESA}`;
const ids = {};
for (const c of casos) {
  const [l] = await sql`insert into leads (company_id, name, phone) values (${EMPRESA}, ${c.nome}, ${c.phone}) returning id`;
  ids[c.wa] = l.id;
}
let falhas = 0;
for (const c of casos) {
  const wamid = novoWamid();
  const r = await enviar(APP, eventos.texto({ de: c.wa, nome: c.nome, texto: "oi", wamid }));
  await new Promise((r) => setTimeout(r, 900));
  const [v] = await sql`select cv.lead_id as conv, ct.lead_id as contato from wa_conversations cv join wa_contacts ct on ct.id = cv.contact_id where ct.wa_id = ${c.wa}`;
  const deve = c.esperaLigar === false ? null : ids[c.wa];
  const ok = r.status === 200 && v && v.conv === deve && v.contato === deve;
  if (!ok) falhas++;
  console.log(ok ? "  ✓" : "  ✗", c.phone.padEnd(18), "→ conversa.lead_id:", v?.conv ? "ligado" : "NULO", "| contato.lead_id:", v?.contato ? "ligado" : "NULO", c.esperaLigar === false ? "(esperado nulo)" : "");
}
await sql.end();
process.exit(falhas ? 1 : 0);
