/**
 * Despachante de webhooks de saída contra o banco do ensaio (nunca produção).
 *
 *   (set -a; . ./.env.ensaio.local; set +a; npx tsx scripts/ensaio-local/e2e-webhooks.ts)
 *
 * A rede é injetada (`deps.postar`/`deps.validar`) porque o destino não pode ser
 * público; o resto — fila, reserva com SKIP LOCKED, plano, contadores, desligamento —
 * roda de verdade no Postgres.
 */
import { createClient } from "@supabase/supabase-js";
import { despacharLote, type ResultadoDoEnvio } from "../../src/lib/webhooks/entrega.server";
import { FALHAS_PARA_DESLIGAR, MAX_TENTATIVAS } from "../../src/lib/webhooks/assinatura.server";
import { cifrarToken } from "../../src/lib/whatsapp/cloud/cifra";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.SUPABASE_URL ?? "")) {
  console.error("recusado: só roda contra o ensaio local");
  process.exit(2);
}
const admin: any = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const A = "11111111-1111-4111-8111-111111111111";

let ok = 0;
const falhas: string[] = [];
const check = (nome: string, cond: boolean, detalhe = "") => {
  if (cond) ok++;
  else {
    falhas.push(nome);
    console.log(`  ✗ ${nome} ${detalhe}`);
  }
};
const secao = (t: string) => console.log(`\n== ${t}`);

const urlOk = async (u: string) => ({ ok: true as const, url: new URL(u) });
function postarCom(resposta: ResultadoDoEnvio | ((n: number) => ResultadoDoEnvio)) {
  const chamadas: any[] = [];
  const postar = async (e: any) => {
    chamadas.push(e);
    return typeof resposta === "function" ? resposta(chamadas.length) : resposta;
  };
  return { postar: postar as any, chamadas };
}

async function novoEndpoint(url = "https://destino.exemplo.com/h", nome = "e2e-wh") {
  const { data, error } = await admin
    .from("webhook_endpoints")
    .insert({
      company_id: A,
      nome,
      url,
      segredo: cifrarToken("whsec_e2e"),
      eventos: ["lead.created", "lead.stage_changed"],
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
async function novaEntrega(endpointId: string, extra: Record<string, unknown> = {}) {
  const eventId = crypto.randomUUID();
  const { data, error } = await admin
    .from("webhook_deliveries")
    .insert({
      company_id: A,
      endpoint_id: endpointId,
      evento: "lead.created",
      event_id: eventId,
      payload: { id: eventId, type: "lead.created", data: {} },
      ...extra,
    })
    .select("id, event_id")
    .single();
  if (error) throw error;
  return data as { id: string; event_id: string };
}
const entrega = async (id: string) =>
  (await admin.from("webhook_deliveries").select("*").eq("id", id).single()).data;
const endpoint = async (id: string) =>
  (await admin.from("webhook_endpoints").select("*").eq("id", id).single()).data;
const limpar = async () => {
  await admin.from("webhook_endpoints").delete().like("nome", "e2e-%");
};
const plano = (p: string) => admin.from("company_plans").update({ plano: p }).eq("company_id", A);

await limpar();
await plano("escala");

secao("1. sucesso");
{
  const ep = await novoEndpoint();
  const e = await novaEntrega(ep);
  const f = postarCom({ ok: true, status: 200, erro: null });
  const r = await despacharLote(admin, 20, { validar: urlOk as any, postar: f.postar });
  const d = await entrega(e.id);
  check("lote processa 1 e entrega", r.reservadas === 1 && r.ok === 1, JSON.stringify(r));
  check(
    "estado final done, 1 tentativa, concluída",
    d.status === "done" && d.attempts === 1 && !!d.concluida_em && d.ultimo_status === 200,
  );
  check(
    "POST recebeu segredo, evento e id estável",
    f.chamadas[0]?.segredo === "whsec_e2e" &&
      f.chamadas[0]?.eventId === e.event_id &&
      f.chamadas[0]?.payload?.id === e.event_id &&
      f.chamadas[0]?.tentativa === 1,
  );
  const x = await endpoint(ep);
  check(
    "endpoint registra última entrega e zera falhas",
    !!x.ultima_entrega_em && x.falhas_seguidas === 0,
  );
  const r2 = await despacharLote(admin, 20, { validar: urlOk as any, postar: f.postar });
  check("entregue não volta para a fila", r2.reservadas === 0 && f.chamadas.length === 1);
}

secao("2. falha → espera crescente → esgota");
{
  const ep = await novoEndpoint();
  const e = await novaEntrega(ep);
  const f = postarCom({ ok: false, status: 500, erro: "o destino respondeu 500" });
  const esperasEsperadas = [60, 300, 1800, 7200, 21600];
  for (let tentativa = 1; tentativa < MAX_TENTATIVAS; tentativa++) {
    const antes = Date.now();
    await despacharLote(admin, 20, { validar: urlOk as any, postar: f.postar });
    const d = await entrega(e.id);
    const espera = (Date.parse(d.proxima_tentativa_em) - antes) / 1000;
    check(
      `tentativa ${tentativa}: volta para a fila daqui a ~${esperasEsperadas[tentativa - 1]}s`,
      d.status === "pending" &&
        d.attempts === tentativa &&
        Math.abs(espera - esperasEsperadas[tentativa - 1]) < 5 &&
        d.ultimo_status === 500,
      `${d.status} ${espera}`,
    );
    if (tentativa === 1) {
      const logo = await despacharLote(admin, 20, { validar: urlOk as any, postar: f.postar });
      check("antes da hora não é reenviada", logo.reservadas === 0);
    }
    await admin
      .from("webhook_deliveries")
      .update({ proxima_tentativa_em: new Date().toISOString() })
      .eq("id", e.id);
  }
  await despacharLote(admin, 20, { validar: urlOk as any, postar: f.postar });
  const d = await entrega(e.id);
  check(
    `após ${MAX_TENTATIVAS} tentativas → failed definitivo`,
    d.status === "failed" &&
      d.attempts === MAX_TENTATIVAS &&
      !!d.concluida_em &&
      d.ultimo_erro === "o destino respondeu 500",
    `${d.status} ${d.attempts}`,
  );
  check("endpoint contou 1 falha seguida", (await endpoint(ep)).falhas_seguidas === 1);
  check(
    "o POST foi tentado exatamente 6 vezes",
    f.chamadas.length === MAX_TENTATIVAS,
    String(f.chamadas.length),
  );
  check("tentativa numerada no envio", f.chamadas.map((c) => c.tentativa).join() === "1,2,3,4,5,6");
}

secao("3. destino que só falha é desligado");
{
  const ep = await novoEndpoint();
  const f = postarCom({ ok: false, status: null, erro: "falha de conexão com o destino" });
  for (let i = 0; i < FALHAS_PARA_DESLIGAR; i++) {
    await novaEntrega(ep, { attempts: MAX_TENTATIVAS - 1 }); // a próxima falha esgota
  }
  await despacharLote(admin, 20, { validar: urlOk as any, postar: f.postar });
  const x = await endpoint(ep);
  check(
    `após ${FALHAS_PARA_DESLIGAR} esgotadas em sequência o endpoint é desligado, com motivo`,
    x.ativo === false &&
      x.falhas_seguidas === FALHAS_PARA_DESLIGAR &&
      /seguidas sem sucesso/.test(x.desativado_motivo ?? ""),
    JSON.stringify(x),
  );
  const e = await novaEntrega(ep);
  const f2 = postarCom({ ok: true, status: 200, erro: null });
  await despacharLote(admin, 20, { validar: urlOk as any, postar: f2.postar });
  const d = await entrega(e.id);
  check(
    "entrega de endpoint desligado falha sem tentar enviar",
    d.status === "failed" && f2.chamadas.length === 0 && /desativado/.test(d.ultimo_erro ?? ""),
  );
}

secao("4. sucesso zera a contagem de falhas");
{
  const ep = await novoEndpoint();
  await admin.from("webhook_endpoints").update({ falhas_seguidas: 5 }).eq("id", ep);
  const e = await novaEntrega(ep);
  await despacharLote(admin, 20, {
    validar: urlOk as any,
    postar: postarCom({ ok: true, status: 204, erro: null }).postar,
  });
  check(
    "falhas_seguidas volta a 0 após sucesso",
    (await endpoint(ep)).falhas_seguidas === 0 && (await entrega(e.id)).status === "done",
  );
}

secao("5. plano sem webhooks");
{
  const ep = await novoEndpoint();
  const e = await novaEntrega(ep);
  await plano("essencial");
  const f = postarCom({ ok: true, status: 200, erro: null });
  await despacharLote(admin, 20, { validar: urlOk as any, postar: f.postar });
  const d = await entrega(e.id);
  await plano("escala");
  check(
    "sem o recurso no plano: failed e nada enviado",
    d.status === "failed" && f.chamadas.length === 0 && /plano/.test(d.ultimo_erro ?? ""),
    `${d.status} ${d.ultimo_erro}`,
  );
}

secao("6. SSRF: validador REAL recusa destino interno");
{
  for (const [rotulo, url] of [
    ["localhost", "https://localhost/hook"],
    ["metadata da nuvem", "https://169.254.169.254/latest/meta-data"],
    ["rede privada", "https://10.0.0.5/h"],
    ["nome de serviço interno", "https://kong/h"],
  ] as const) {
    const ep = await novoEndpoint(url, `e2e-ssrf-${rotulo}`);
    const e = await novaEntrega(ep);
    const f = postarCom({ ok: true, status: 200, erro: null });
    await despacharLote(admin, 20, { postar: f.postar }); // sem `validar`: usa o real
    const d = await entrega(e.id);
    check(
      `${rotulo}: recusado, nada enviado, endpoint conta falha`,
      d.status === "failed" &&
        f.chamadas.length === 0 &&
        /destino recusado/.test(d.ultimo_erro ?? "") &&
        (await endpoint(ep)).falhas_seguidas === 1,
      `${d.status} ${d.ultimo_erro}`,
    );
  }
}

secao("7. entrega presa em 'running' volta para a fila");
{
  const ep = await novoEndpoint();
  const e = await novaEntrega(ep, {
    status: "running",
    attempts: 1,
    iniciada_em: new Date(Date.now() - 10 * 60_000).toISOString(),
  });
  const recente = await novaEntrega(ep, {
    status: "running",
    attempts: 1,
    iniciada_em: new Date().toISOString(),
  });
  const f = postarCom({ ok: true, status: 200, erro: null });
  await despacharLote(admin, 20, { validar: urlOk as any, postar: f.postar });
  check(
    "a presa há 10 min é retomada e entregue",
    (await entrega(e.id)).status === "done" && (await entrega(e.id)).attempts === 2,
  );
  check(
    "a que está rodando agora é deixada em paz",
    (await entrega(recente.id)).status === "running",
  );
}

secao("8. dois despachantes ao mesmo tempo não duplicam envio");
{
  const ep = await novoEndpoint();
  const ids: string[] = [];
  for (let i = 0; i < 12; i++) ids.push((await novaEntrega(ep)).id);
  const f = postarCom({ ok: true, status: 200, erro: null });
  const [r1, r2, r3] = await Promise.all(
    [1, 2, 3].map(() => despacharLote(admin, 20, { validar: urlOk as any, postar: f.postar })),
  );
  const vistos = f.chamadas.map((c) => c.entregaId);
  check(
    "12 entregas, 12 envios, nenhum repetido",
    f.chamadas.length === 12 && new Set(vistos).size === 12,
    `${f.chamadas.length} envios, ${new Set(vistos).size} únicos, lotes ${r1.reservadas}/${r2.reservadas}/${r3.reservadas}`,
  );
  const todas = await Promise.all(ids.map(entrega));
  check(
    "todas done com 1 tentativa",
    todas.every((d) => d.status === "done" && d.attempts === 1),
  );
}

secao("9. limpeza de histórico");
{
  const ep = await novoEndpoint();
  const velha = await novaEntrega(ep, {
    status: "done",
    attempts: 1,
    concluida_em: new Date(Date.now() - 31 * 86_400_000).toISOString(),
  });
  const nova = await novaEntrega(ep, {
    status: "done",
    attempts: 1,
    concluida_em: new Date().toISOString(),
  });
  const pendente = await novaEntrega(ep);
  await admin.rpc("limpar_entregas_de_webhook");
  check("apaga concluída há mais de 30 dias", (await entrega(velha.id)) === null);
  check(
    "mantém a recente e a pendente",
    !!(await entrega(nova.id)) && !!(await entrega(pendente.id)),
  );
}

secao("10. remover o endpoint apaga o histórico dele");
{
  const ep = await novoEndpoint();
  const e = await novaEntrega(ep);
  await admin.from("webhook_endpoints").delete().eq("id", ep);
  check("entregas somem junto (cascata)", (await entrega(e.id)) === null);
}

secao("11. segredo cifrado em repouso e falha de configuração não perde evento");
{
  const ep = await novoEndpoint();
  const bruto = (await endpoint(ep)).segredo as string;
  check(
    "no banco o segredo NÃO está em texto puro",
    bruto !== "whsec_e2e" && bruto.startsWith("v1.") && !bruto.includes("whsec_e2e"),
  );
  const e = await novaEntrega(ep);
  const guardada = process.env.WA_TOKEN_KEY;
  delete process.env.WA_TOKEN_KEY;
  const f = postarCom({ ok: true, status: 200, erro: null });
  await despacharLote(admin, 20, { validar: urlOk as any, postar: f.postar });
  const d = await entrega(e.id);
  check(
    "sem a chave de cifra: não envia, fica para nova tentativa (evento preservado)",
    d.status === "pending" && f.chamadas.length === 0 && /segredo/.test(d.ultimo_erro ?? ""),
    `${d.status} ${d.ultimo_erro}`,
  );
  process.env.WA_TOKEN_KEY = guardada;
  await admin
    .from("webhook_deliveries")
    .update({ proxima_tentativa_em: new Date().toISOString() })
    .eq("id", e.id);
  await despacharLote(admin, 20, { validar: urlOk as any, postar: f.postar });
  check(
    "conserta a configuração e o mesmo evento é entregue",
    (await entrega(e.id)).status === "done" &&
      f.chamadas.length === 1 &&
      f.chamadas[0].segredo === "whsec_e2e",
  );
}

await limpar();
await plano("escala");
console.log(`\n${ok} verificações ok, ${falhas.length} falhas`);
if (falhas.length) {
  console.log("FALHARAM:\n - " + falhas.join("\n - "));
  process.exit(1);
}
