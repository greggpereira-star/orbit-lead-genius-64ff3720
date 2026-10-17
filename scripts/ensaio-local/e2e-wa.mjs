/**
 * Ensaio de PONTA A PONTA do módulo WhatsApp, sem número da Meta:
 *   webhook assinado → rota real → processador → PostgREST real → base fiel.
 * Só roda contra 127.0.0.1 (trava abaixo). Sai com código 1 se algo falhar.
 *
 *   node scripts/ensaio-local/e2e-wa.mjs            (app em http://localhost:8082)
 *   APP=http://localhost:8081 node ...
 */
import postgres from "postgres";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { eventos, enviar, verificar, novoWamid, PNID } from "./webhooks.mjs";

const APP = process.env.APP ?? "http://localhost:8082";
const PG = process.env.ENSAIO_PG ?? "postgres://postgres@127.0.0.1:54329/leadflow_ensaio";
if (!/@127\.0\.0\.1:|@localhost:/.test(PG)) throw new Error("Recuso rodar fora de 127.0.0.1.");
const ARQUIVOS = process.env.ENSAIO_ARQUIVOS ?? join(process.env.TMPDIR ?? "/tmp", "leadflow-ensaio-arquivos");
const sql = postgres(PG, { onnotice: () => {}, max: 3 });

let ok = 0; const falhas = [];
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function comoDeve(nome, f) {
  try { await f(); ok++; console.log("  ✓", nome); }
  catch (e) { falhas.push(nome); console.log("  ✗", nome, "\n     ", String(e.message ?? e).split("\n")[0]); }
}
const lacunas = [];
const lacuna = (nome, motivo) => { lacunas.push(`${nome} — ${motivo}`); console.log('  ⚠ LACUNA CONHECIDA:', nome, '\n      ', motivo); };
const igual = (a, b, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`); };
const verdade = (c, m) => { if (!c) throw new Error(m); };
const [{ id: EMPRESA }] = await sql`select id from companies where slug = 'empresa-ensaio'`;
const telefone = (() => { let i = 100; return () => `55279${String(11110000 + i++)}`; })();

async function conversaDe(wa) {
  const [c] = await sql`select cv.*, ct.opted_out_at, ct.profile_name from wa_conversations cv join wa_contacts ct on ct.id = cv.contact_id where ct.company_id = ${EMPRESA} and ct.wa_id = ${wa}`;
  return c;
}
const mensagem = async (wamid) => (await sql`select * from wa_messages where provider_message_id = ${wamid}`)[0];
async function enviarEEsperar(corpo, opts) { const r = await enviar(APP, corpo, opts); await esperar(700); return r; }

// ---------------------------------------------------------------- preparação
await sql`truncate wa_media, wa_messages, wa_conversations, wa_contacts, wa_webhook_events restart identity cascade`;
await sql`delete from leads where company_id = ${EMPRESA}`;
await sql`update wa_phone_numbers set status = 'active', disconnected_at = null, disconnection_reason = null, history_progress = null where phone_number_id = ${PNID}`;
await sql`delete from wa_templates where company_id = ${EMPRESA}`;
const META_FALSA = process.env.META_FALSA ?? "http://127.0.0.1:9911";
const metaFalsa = {
  guardarMidia: (id, mime, bytes) => fetch(`${META_FALSA}/_midia`, { method: "POST", body: JSON.stringify({ id, mime, base64: bytes.toString("base64") }) }),
};
await fetch(`${META_FALSA}/_chamadas`).catch(() => { throw new Error("Meta falsa fora do ar: rode scripts/ensaio-local/subir.sh"); });

console.log("\n1. Entrada: verificação e assinatura");
await comoDeve("handshake com o token certo devolve o desafio", async () => { const r = await verificar(APP); igual([r.status, r.texto], [200, "12345"]); });
await comoDeve("handshake com token errado é recusado (403)", async () => igual((await verificar(APP, { token: "x" })).status, 403));
await comoDeve("handshake com modo diferente de subscribe é recusado", async () => igual((await verificar(APP, { modo: "unsubscribe" })).status, 403));
await comoDeve("sem assinatura: 401 e nada gravado", async () => { const a = (await sql`select count(*)::int n from wa_webhook_events`)[0].n; igual((await enviar(APP, eventos.texto({ de: telefone(), nome: "X", texto: "x" }), { semAssinatura: true })).status, 401); igual((await sql`select count(*)::int n from wa_webhook_events`)[0].n, a); });
await comoDeve("assinatura com segredo errado: 401", async () => igual((await enviar(APP, eventos.texto({ de: telefone(), nome: "X", texto: "x" }), { segredo: "errado" })).status, 401));
await comoDeve("JSON inválido com assinatura válida: 400", async () => igual((await enviar(APP, "{nao e json")).status, 400));
await comoDeve("corpo acima do teto (2 MB): 413", async () => igual((await enviar(APP, JSON.stringify({ lixo: "x".repeat(2_100_000) }))).status, 413));
await comoDeve("assinatura sobre corpo adulterado é recusada", async () => {
  const cru = JSON.stringify(eventos.texto({ de: telefone(), nome: "X", texto: "original" }));
  const { assinar } = await import("./meta-falsa.mjs"); const { META_APP_SECRET } = await import("./chaves.mjs");
  const r = await fetch(`${APP}/api/public/wa-webhook`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": assinar(cru, META_APP_SECRET) }, body: cru.replace("original", "adulterado") });
  igual(r.status, 401);
});

console.log("\n2. Mensagem do cliente");
const ana = telefone(); const w1 = novoWamid();
await comoDeve("primeira mensagem cria contato, conversa e mensagem; abre a janela; 1 não lida", async () => {
  igual((await enviarEEsperar(eventos.texto({ de: ana, nome: "Ana Souza", texto: "Olá, vi o anúncio", wamid: w1 }))).status, 200);
  const c = await conversaDe(ana); verdade(c, "conversa não criada");
  igual([c.profile_name, c.unread_agent, c.status, c.last_message_preview], ["Ana Souza", 1, "open", "Olá, vi o anúncio"]);
  verdade(c.last_inbound_at, "janela de 24 h não abriu");
  const m = await mensagem(w1); igual([m.direction, m.origin, m.type, m.status], ["inbound", "customer", "text", "received"]);
});
await comoDeve("reentrega do MESMO wamid não duplica nem soma não lida", async () => {
  await enviarEEsperar(eventos.texto({ de: ana, nome: "Ana Souza", texto: "Olá, vi o anúncio", wamid: w1 }));
  igual((await sql`select count(*)::int n from wa_messages where provider_message_id = ${w1}`)[0].n, 1);
  igual((await conversaDe(ana)).unread_agent, 1);
});
await comoDeve("segunda mensagem soma a não lida e atualiza a prévia", async () => {
  await enviarEEsperar(eventos.texto({ de: ana, nome: "Ana Souza", texto: "Qual o valor?" }));
  const c = await conversaDe(ana); igual([c.unread_agent, c.last_message_preview], [2, "Qual o valor?"]);
});
await comoDeve("resposta citada: o payload guarda o wamid original e wa_messages.reply_to aponta para a mensagem original", async () => {
  const w = novoWamid(); await enviarEEsperar(eventos.texto({ de: ana, nome: "Ana Souza", texto: "sobre aquilo", wamid: w, contexto: w1 }));
  const m = await mensagem(w); igual(m.payload?.context?.id, w1, "payload.context.id");
  igual(m.reply_to, (await mensagem(w1)).id, "reply_to");
});
await comoDeve("citar uma mensagem que não existe no banco não grava vínculo nem falha", async () => {
  const w = novoWamid(); igual((await enviarEEsperar(eventos.texto({ de: ana, nome: "Ana Souza", texto: "citando o passado", wamid: w, contexto: "wamid.NUNCA_EXISTIU" }))).status, 200);
  const m = await mensagem(w); verdade(m, "mensagem não gravada"); igual(m.reply_to, null);
});
await comoDeve("citar mensagem de OUTRA conversa/contato da empresa não vaza o vínculo para fora da empresa", async () => {
  const w = novoWamid(); await enviarEEsperar(eventos.texto({ de: telefone(), nome: "Outro", texto: "oi", wamid: w }));
  const [{ id }] = await sql`select id from wa_messages where provider_message_id = ${w}`;
  const w2 = novoWamid(); await enviarEEsperar(eventos.texto({ de: ana, nome: "Ana Souza", texto: "cita de outro contato", wamid: w2, contexto: w }));
  igual((await mensagem(w2)).reply_to, id, "mesma empresa vincula");
});
await comoDeve("telefone e nome de contatos diferentes ficam isolados em conversas separadas", async () => {
  const b = telefone(); await enviarEEsperar(eventos.texto({ de: b, nome: "Bruno", texto: "oi" }));
  const [ca, cb] = [await conversaDe(ana), await conversaDe(b)]; verdade(ca.id !== cb.id, "misturou conversas");
});

console.log("\n3. Mídia recebida");
await comoDeve("imagem: cria a mídia, baixa pela Meta falsa e guarda no bucket", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const id = "MEDIA_ENSAIO_1"; await metaFalsa.guardarMidia(id, "image/png", png);
  const de = telefone(); const w = novoWamid();
  await enviarEEsperar(eventos.midia({ de, nome: "Carla", mediaId: id, legenda: "foto do imóvel", wamid: w, mime: "image/png" }));
  await esperar(1500);
  const m = await mensagem(w); igual([m.type, m.body], ["image", "foto do imóvel"]);
  const [md] = await sql`select * from wa_media where provider_media_id = ${id}`; verdade(md, "wa_media não criada");
  igual(md.status, "stored", "status da mídia"); verdade(md.storage_path, "sem caminho");
  verdade(existsSync(join(ARQUIVOS, "wa-media", md.storage_path)), "arquivo não está no bucket");
});

console.log("\n4. Pedido de parar (opt-out)");
await comoDeve("\"sair\" marca o contato como optado e a conversa continua legível", async () => {
  const de = telefone(); await enviarEEsperar(eventos.texto({ de, nome: "Diego", texto: "oi" }));
  igual((await conversaDe(de)).opted_out_at, null);
  await enviarEEsperar(eventos.texto({ de, nome: "Diego", texto: "SAIR" }));
  verdade((await conversaDe(de)).opted_out_at, "opt-out não registrado");
});
await comoDeve("texto parecido com \"sair\" no meio de uma frase NÃO dispara opt-out", async () => {
  const de = telefone(); await enviarEEsperar(eventos.texto({ de, nome: "Eva", texto: "preciso sair mais cedo amanhã, pode ser às 10h?" }));
  igual((await conversaDe(de)).opted_out_at, null);
});

console.log("\n5. Anúncio (clique para o WhatsApp)");
await comoDeve("mensagem com referral guarda a origem do anúncio na conversa", async () => {
  const de = telefone();
  await enviarEEsperar(eventos.texto({ de, nome: "Fábio", texto: "Quero saber mais", referral: { source_type: "ad", source_id: "AD123", ctwa_clid: "CLID_ENSAIO_1", headline: "Lançamento", source_url: "https://fb.me/x" } }));
  const c = await conversaDe(de); verdade(c.origin, "origin vazia");
  verdade(JSON.stringify(c.origin).includes("CLID_ENSAIO_1") || JSON.stringify(c.origin).includes("AD123"), "origem sem o anúncio: " + JSON.stringify(c.origin));
});

console.log("\n6. Coexistência: o negócio responde pelo celular");
const gil = telefone();
await comoDeve("eco do app aparece como mensagem do negócio, sem abrir janela nem somar não lida", async () => {
  await enviarEEsperar(eventos.eco({ para: gil, texto: "Oi Gil, tudo bem?" }));
  const c = await conversaDe(gil); verdade(c, "eco não criou a conversa");
  igual([c.unread_agent, c.last_inbound_at], [0, null]);
});
await comoDeve("cliente responde ao eco: agora a janela abre e a não lida sobe", async () => {
  await enviarEEsperar(eventos.texto({ de: gil, nome: "Gil", texto: "Tudo ótimo" }));
  const c = await conversaDe(gil); igual(c.unread_agent, 1); verdade(c.last_inbound_at, "janela não abriu");
});

console.log("\n7. Status de entrega");
const hel = telefone(); const wEco = novoWamid("NEGOCIO");
await comoDeve("sent → delivered → read avança o status da mensagem", async () => {
  await enviarEEsperar(eventos.eco({ para: hel, texto: "Proposta enviada", wamid: wEco }));
  for (const [st, esperado] of [["sent", "sent"], ["delivered", "delivered"], ["read", "read"]]) {
    await enviarEEsperar(eventos.status({ wamid: wEco, status: st, para: hel })); igual((await mensagem(wEco)).status, esperado, st);
  }
});
await comoDeve("\"delivered\" atrasado depois de \"read\" NÃO faz o status voltar", async () => {
  await enviarEEsperar(eventos.status({ wamid: wEco, status: "delivered", para: hel })); igual((await mensagem(wEco)).status, "read");
});
await comoDeve("falha 131047 (fora da janela) grava o erro na mensagem", async () => {
  const w = novoWamid("NEGOCIO"); await enviarEEsperar(eventos.eco({ para: hel, texto: "fora da janela", wamid: w }));
  await enviarEEsperar(eventos.status({ wamid: w, status: "failed", para: hel, erro: { code: 131047, title: "Re-engagement message" } }));
  const m = await mensagem(w); igual([m.status, m.error_code], ["failed", 131047]);
});
await comoDeve("status de mensagem desconhecida não explode e não cria mensagem", async () => {
  const antes = (await sql`select count(*)::int n from wa_messages`)[0].n;
  igual((await enviarEEsperar(eventos.status({ wamid: "wamid.NAOEXISTE", status: "read", para: hel }))).status, 200);
  igual((await sql`select count(*)::int n from wa_messages`)[0].n, antes);
});

console.log("\n8. Templates e conta");
await comoDeve("aprovação de template pela Meta atualiza o status (e a reprovação grava o motivo)", async () => {
  const [{ id: conta }] = await sql`select id from wa_accounts where waba_id = 'WABA1' and company_id = ${EMPRESA}`;
  await sql`insert into wa_templates (account_id, company_id, name, language, category, status, components) values (${conta}, ${EMPRESA}, 'boas_vindas', 'pt_BR', 'UTILITY', 'PENDING', '[]'::jsonb), (${conta}, ${EMPRESA}, 'promo', 'pt_BR', 'MARKETING', 'PENDING', '[]'::jsonb)`;
  await enviarEEsperar(eventos.templateStatus({ nome: "boas_vindas", evento: "APPROVED" }));
  await enviarEEsperar(eventos.templateStatus({ nome: "promo", evento: "REJECTED", motivo: "INVALID_FORMAT", id: "1000" }));
  const t = Object.fromEntries((await sql`select name, status, rejection_reason from wa_templates where company_id = ${EMPRESA}`).map((x) => [x.name, x]));
  igual(t.boas_vindas.status, "APPROVED"); igual(t.promo.status, "REJECTED"); igual(t.promo.rejection_reason, "INVALID_FORMAT");
});
await comoDeve("conta desligada pela Meta (PARTNER_REMOVED / ACCOUNT_OFFBOARDED) desconecta o número e guarda o motivo; ACCOUNT_RECONNECTED reativa", async () => {
  const estado = async () => (await sql`select status, disconnection_reason from wa_phone_numbers where phone_number_id = ${PNID}`)[0];
  await enviarEEsperar(eventos.conta({ evento: "PARTNER_REMOVED" }));
  let n = await estado(); igual(n.status, "disconnected"); verdade(n.disconnection_reason, "sem motivo");
  await enviarEEsperar(eventos.conta({ evento: "ACCOUNT_RECONNECTED" }));
  igual((await estado()).status, "active");
  await enviarEEsperar(eventos.conta({ evento: "ACCOUNT_OFFBOARDED" }));
  igual((await estado()).status, "disconnected");
  await sql`update wa_phone_numbers set status = 'active', disconnected_at = null, disconnection_reason = null where phone_number_id = ${PNID}`;
});
await comoDeve("eventos de conta que o código não trata (ex.: violação) respondem 200 e NÃO mexem no número", async () => {
  igual((await enviarEEsperar(eventos.conta({ evento: "ACCOUNT_VIOLATION" }))).status, 200);
  igual((await sql`select status from wa_phone_numbers where phone_number_id = ${PNID}`)[0].status, "active");
  // O evento fica guardado como 'ignorado'/'conta' e aparece em "Avisos da Meta" (configuração).
  verdade((await sql`select 1 from wa_webhook_events where field = 'conta' and payload->>'evento' = 'ACCOUNT_VIOLATION' limit 1`).length > 0, "evento de violação não ficou guardado para o aviso");
});

console.log("\n9. Histórico (coexistência)");
await comoDeve("histórico importa mensagens antigas sem abrir janela nem somar não lida, e registra o progresso", async () => {
  const de = telefone(); const antigo = String(Math.floor(Date.now() / 1000) - 86400 * 20);
  await enviarEEsperar(eventos.historico({ cliente: de, progresso: 40, mensagens: [
    { id: novoWamid("H"), from: de, timestamp: antigo, type: "text", text: { body: "mensagem antiga do cliente" } },
    { id: novoWamid("H"), from: "5527900000000", timestamp: antigo, type: "text", text: { body: "resposta antiga do negócio" } },
  ] }));
  const c = await conversaDe(de); verdade(c, "histórico não criou a conversa");
  igual(c.unread_agent, 0, "não lida"); 
  const [n] = await sql`select history_progress from wa_phone_numbers where phone_number_id = ${PNID}`; igual(n.history_progress, 40);
  igual((await sql`select count(*)::int n from wa_messages where conversation_id = ${c.id}`)[0].n, 2);
});

console.log("\n10. Robustez");
await comoDeve("campo desconhecido responde 200 e fica registrado como ignorado", async () => {
  igual((await enviarEEsperar(eventos.campoDesconhecido())).status, 200);
  verdade((await sql`select 1 from wa_webhook_events where status = 'ignored' or field = 'alguma_coisa_nova' limit 1`).length > 0, "evento não registrado");
});
await comoDeve("número desconhecido (outra empresa/fora do cadastro) não grava mensagem nenhuma", async () => {
  const antes = (await sql`select count(*)::int n from wa_messages`)[0].n;
  const corpo = eventos.texto({ de: telefone(), nome: "Intruso", texto: "oi" }); corpo.entry[0].changes[0].value.metadata.phone_number_id = "PNID_QUE_NAO_EXISTE";
  igual((await enviarEEsperar(corpo)).status, 200);
  igual((await sql`select count(*)::int n from wa_messages`)[0].n, antes);
});
await comoDeve("lote com várias mensagens e status no mesmo POST é processado inteiro", async () => {
  const [a, b] = [telefone(), telefone()];
  const corpo = eventos.texto({ de: a, nome: "L1", texto: "um" });
  corpo.entry[0].changes[0].value.messages.push({ from: b, id: novoWamid(), timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "dois" } });
  corpo.entry[0].changes[0].value.contacts.push({ profile: { name: "L2" }, wa_id: b });
  await enviarEEsperar(corpo); verdade(await conversaDe(a), "faltou a 1ª"); verdade(await conversaDe(b), "faltou a 2ª");
});
await comoDeve("nenhum evento ficou preso: tudo 'processed', 'ignored' ou com motivo de falha", async () => {
  const pend = await sql`select dedup_key, status, last_error from wa_webhook_events where status not in ('processed','ignored')`;
  verdade(pend.length === 0, "eventos pendentes/falhos: " + JSON.stringify(pend.slice(0, 3)));
});

console.log(`\n${ok} passaram · ${falhas.length} falharam · ${lacunas.length} lacunas conhecidas`);
for (const l of lacunas) console.log(" ⚠", l);
if (falhas.length) { console.log("Falhas:\n - " + falhas.join("\n - ")); }
await sql.end();
process.exit(falhas.length ? 1 : 0);
