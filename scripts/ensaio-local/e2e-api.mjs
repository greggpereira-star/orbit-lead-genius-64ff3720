#!/usr/bin/env node
/**
 * Roteiro de ponta a ponta da API pública (/api/public/v1) no ensaio local.
 *
 *   ENSAIO_DIR=... ./scripts/ensaio-local/subir.sh && npx tsx scripts/ensaio-local/semear.ts
 *   (preencher plans/company_plans e a "Empresa B" — ver CABECALHO abaixo)
 *   BASE=http://localhost:8081 node scripts/ensaio-local/e2e-api.mjs
 *
 * Nunca roda contra produção: só fala com 127.0.0.1/localhost e com o Postgres 54329.
 * Cria as próprias chaves (prefixo "e2e-") e limpa o que criou no começo de cada rodada.
 */
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";

const BASE = process.env.BASE ?? "http://localhost:8081";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  console.error("recusado: BASE precisa ser local");
  process.exit(2);
}
const PSQL = process.env.PSQL ?? "/opt/homebrew/opt/postgresql@16/bin/psql";
const A = "11111111-1111-4111-8111-111111111111";
const B = "00000000-0000-0000-0000-0000000000b2";

const sql = (q) =>
  execFileSync(PSQL, ["-h", "127.0.0.1", "-p", "54329", "-U", "postgres", "-d", "leadflow_ensaio", "-Atq", "-v", "ON_ERROR_STOP=1", "-c", q], {
    env: { ...process.env, LC_ALL: "en_US.UTF-8" },
  })
    .toString()
    .trim();

let ok = 0;
const falhas = [];
function check(nome, cond, detalhe = "") {
  if (cond) ok++;
  else {
    falhas.push(nome);
    console.log(`  ✗ ${nome} ${detalhe}`);
  }
}
const secao = (t) => console.log(`\n== ${t}`);

function novaChave(nome, empresa, escopos, extra = "") {
  const chave = "alf_" + randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(chave).digest("hex");
  sql(
    `insert into api_keys (company_id, nome, prefixo, hash, escopos ${extra ? ", " + extra.split("=")[0] : ""}) values ('${empresa}','${nome}','${chave.slice(0, 12)}','${hash}','{${escopos}}'${extra ? ", " + extra.split("=")[1] : ""})`,
  );
  return chave;
}

async function api(chave, metodo, caminho, corpo, cab = {}) {
  const r = await fetch(BASE + "/api/public/v1" + caminho, {
    method: metodo,
    headers: { ...(chave ? { authorization: `Bearer ${chave}` } : {}), ...(corpo !== undefined ? { "content-type": "application/json" } : {}), ...cab },
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
  const txt = await r.text();
  let json = null;
  try {
    json = JSON.parse(txt);
  } catch {}
  return { status: r.status, json, headers: r.headers, txt };
}

// --- limpeza da rodada anterior ------------------------------------------
sql(`delete from leads where metadata->>'origem' = 'api'`);
sql(`delete from api_keys where nome like 'e2e-%'`);
// Qualquer destino que sobrou de outra verificação (ex.: criado pela tela) mudaria as contagens de entregas.
sql(`delete from webhook_endpoints where company_id in ('${A}','${B}')`);

const kRW = novaChave("e2e-rw", A, "leads:read,leads:write");
const kRO = novaChave("e2e-ro", A, "leads:read");
const kWO = novaChave("e2e-wo", A, "leads:write");
const kB = novaChave("e2e-b", B, "leads:read,leads:write");
const kRev = novaChave("e2e-revogada", A, "leads:read", "revogada_em=now()");
const kExp = novaChave("e2e-vencida", A, "leads:read", "expira_em=now() - interval '1 day'");

const etapas = Object.fromEntries(sql(`select name||'|'||id from stages where company_id='${A}'`).split("\n").map((l) => l.split("|")));
const etapasB = Object.fromEntries(sql(`select name||'|'||id from stages where company_id='${B}'`).split("\n").map((l) => l.split("|")));

// ---------------------------------------------------------------------------
secao("1. autenticação");
{
  let r = await api(null, "GET", "/stages");
  check("sem cabeçalho → 401", r.status === 401 && r.json?.error?.code === "invalid_api_key");
  check("401 traz www-authenticate", /Bearer/.test(r.headers.get("www-authenticate") ?? ""));
  r = await api("alf_curta", "GET", "/stages");
  check("chave torta → 401", r.status === 401);
  r = await api("alf_" + randomBytes(32).toString("base64url"), "GET", "/stages");
  check("chave desconhecida → 401", r.status === 401);
  const msgDesconhecida = r.json?.error?.message;
  r = await api(kRev, "GET", "/stages");
  check("chave revogada → 401, mesma mensagem (não revela que existe)", r.status === 401 && r.json?.error?.message === msgDesconhecida);
  r = await api(kExp, "GET", "/stages");
  check("chave vencida → 401, mesma mensagem", r.status === 401 && r.json?.error?.message === msgDesconhecida);
  r = await api(kRO, "GET", "/stages");
  check("chave válida lista etapas", r.status === 200 && r.json?.data?.length === 4, r.txt.slice(0, 120));
  check("etapas têm id, name, kind, position", r.json?.data?.[0] && ["id", "name", "kind", "position"].every((k) => k in r.json.data[0]));
  check("sem CORS (API é de servidor)", r.headers.get("access-control-allow-origin") === null);
  check("sem cache", r.headers.get("cache-control") === "no-store");
  check("ultimo_uso_em é marcado", sql(`select ultimo_uso_em is not null from api_keys where nome='e2e-ro'`) === "t");
  r = await api(kWO, "GET", "/leads");
  check("escopo só de escrita não lê → 403", r.status === 403 && r.json?.error?.code === "insufficient_scope");
  r = await api(kRO, "POST", "/leads", { name: "x" });
  check("escopo só de leitura não cria → 403", r.status === 403 && r.json?.error?.code === "insufficient_scope");
  r = await api(kRO, "PATCH", `/leads/${randomBytes(16).toString("hex").replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")}`, { name: "x" });
  check("escopo só de leitura não atualiza → 403", r.status === 403);
}

// ---------------------------------------------------------------------------
secao("2. criar lead");
let leadA;
{
  const r = await api(kRW, "POST", "/leads", {
    name: "Ana API",
    email: "Ana@Exemplo.com",
    phone: "(27) 99999-1234",
    external_id: "crm-77",
    utm_source: "google",
    custom_fields: { cargo: "Dona", faturamento: "1500,50" },
  });
  check("cria → 201", r.status === 201, r.txt.slice(0, 200));
  leadA = r.json?.data;
  check("e-mail normalizado em minúsculas", leadA?.email === "ana@exemplo.com");
  check("entra na etapa de entrada", leadA?.stage_id === etapas["Novo"]);
  check("origem padrão 'api'", leadA?.source === "api");
  check("campo numérico convertido", leadA?.custom_fields?.faturamento === 1500.5 && leadA?.custom_fields?.cargo === "Dona");
  check("não expõe campos internos", !("gclid" in (leadA ?? {})) && !("company_id" in (leadA ?? {})) && !("metadata" in (leadA ?? {})));
  const linha = sql(`select status, board_order < 0, stage_entered_at is not null, metadata->>'origem', company_id from leads where id='${leadA?.id}'`);
  check("linha no banco coerente (status new, topo da coluna, origem api, empresa da chave)", linha === `new|t|t|api|${A}`, linha);
  check("lead_events registra a criação", sql(`select count(*) from lead_events where lead_id='${leadA?.id}' and event_type='api_created'`) === "1");

  const casos = [
    ["corpo vazio → 400", {}, 400],
    ["campo desconhecido → 400", { name: "x", gclid: "abc" }, 400],
    ["company_id no corpo → 400 (não deixa escolher a empresa)", { name: "x", company_id: B }, 400],
    ["telefone inválido → 400", { name: "x", phone: "123" }, 400],
    ["e-mail inválido → 400", { email: "nao-e-email" }, 400],
    ["valor negativo → 400", { name: "x", deal_value: -5 }, 400],
    ["campo personalizado inexistente → 422", { name: "x", custom_fields: { salario: 1 } }, 422],
    ["opção inválida → 422", { name: "x", custom_fields: { porte: "Gigante" } }, 422],
    ["etapa de outra empresa → 422", { name: "x", stage_id: etapasB["Novo B"] }, 422],
    ["criar direto em etapa de ganho → 422", { name: "x", stage_id: etapas["Ganho"] }, 422],
  ];
  const antes = sql(`select count(*) from leads where company_id='${A}'`);
  for (const [nome, corpo, esperado] of casos) {
    const x = await api(kRW, "POST", "/leads", corpo);
    check(nome, x.status === esperado, `recebi ${x.status} ${x.txt.slice(0, 100)}`);
  }
  let x = await api(kRW, "POST", "/leads", "{isso não é json");
  check("JSON inválido → 400", x.status === 400 && x.json?.error?.code === "invalid_json");
  x = await api(kRW, "POST", "/leads", JSON.stringify({ name: "x".repeat(70_000) }));
  check("corpo gigante → 413", x.status === 413, String(x.status));
  check("nada foi gravado pelos pedidos inválidos", sql(`select count(*) from leads where company_id='${A}'`) === antes);
}

// ---------------------------------------------------------------------------
secao("3. idempotência");
{
  const chave = "pedido-" + randomBytes(4).toString("hex");
  const r1 = await api(kRW, "POST", "/leads", { name: "Idem" }, { "idempotency-key": chave });
  const r2 = await api(kRW, "POST", "/leads", { name: "Idem" }, { "idempotency-key": chave });
  check("1ª chamada 201, 2ª 200 com o mesmo lead", r1.status === 201 && r2.status === 200 && r1.json.data.id === r2.json.data.id);
  check("2ª marca idempotent-replay", r2.headers.get("idempotent-replay") === "true");

  const par = "paralelo-" + randomBytes(4).toString("hex");
  const rs = await Promise.all(Array.from({ length: 6 }, () => api(kRW, "POST", "/leads", { name: "Paralelo" }, { "idempotency-key": par })));
  const ids = new Set(rs.map((x) => x.json?.data?.id));
  check("6 chamadas simultâneas, mesma chave → 1 lead só", ids.size === 1 && rs.every((x) => x.status === 200 || x.status === 201), rs.map((x) => x.status).join(","));
  check("e uma única linha no banco", sql(`select count(*) from leads where company_id='${A}' and event_id='api:${par}'`) === "1");

  const ruim = await api(kRW, "POST", "/leads", { name: "x" }, { "idempotency-key": "tem espaço" });
  check("Idempotency-Key inválida → 400", ruim.status === 400);

  // a mesma Idempotency-Key em OUTRA empresa é outro lead (a chave é por empresa)
  const rb = await api(kB, "POST", "/leads", { name: "Idem B" }, { "idempotency-key": chave });
  check("mesma Idempotency-Key em outra empresa cria outro lead", rb.status === 201 && rb.json.data.id !== r1.json.data.id, String(rb.status));
}

// ---------------------------------------------------------------------------
secao("4. listagem e paginação");
{
  for (let i = 0; i < 6; i++) await api(kRW, "POST", "/leads", { name: `Lista ${i}`, email: `lista${i}@exemplo.com` });
  const total = Number(sql(`select count(*) from leads where company_id='${A}'`));

  const ids = [];
  let cursor = null;
  let paginas = 0;
  do {
    const r = await api(kRO, "GET", `/leads?limit=4${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    check(`página ${paginas + 1} ok`, r.status === 200, r.txt.slice(0, 150));
    ids.push(...(r.json?.data ?? []).map((l) => l.id));
    cursor = r.json?.next_cursor ?? null;
    paginas++;
  } while (cursor && paginas < 50);
  check("percorre todos os leads da empresa sem repetir nem perder", ids.length === total && new Set(ids).size === total, `${ids.length}/${total} únicos ${new Set(ids).size}`);
  const esperado = sql(`select id from leads where company_id='${A}' order by created_at desc, id desc`).split("\n");
  check("na ordem created_at desc, id desc", JSON.stringify(ids) === JSON.stringify(esperado));
  check("última página sem next_cursor", cursor === null);

  let r = await api(kRO, "GET", `/leads?stage_id=${etapas["Novo"]}&limit=100`);
  check("filtro por etapa", r.status === 200 && r.json.data.every((l) => l.stage_id === etapas["Novo"]) && r.json.data.length === total);
  r = await api(kRO, "GET", `/leads?external_id=crm-77`);
  check("filtro por external_id", r.json?.data?.length === 1 && r.json.data[0].id === leadA.id);
  r = await api(kRO, "GET", `/leads?email=ANA@exemplo.com`);
  check("filtro por e-mail (sem diferenciar maiúsculas)", r.json?.data?.length === 1);
  r = await api(kRO, "GET", `/leads?email=%25`);
  check("curinga % no e-mail é literal (não lista tudo)", r.status === 200 && r.json.data.length === 0, String(r.json?.data?.length));
  r = await api(kRO, "GET", `/leads?created_since=2999-01-01`);
  check("created_since no futuro → vazio", r.json?.data?.length === 0);

  for (const [nome, qs] of [
    ["limit=0", "limit=0"],
    ["limit=101", "limit=101"],
    ["limit=abc", "limit=abc"],
    ["cursor lixo", "cursor=lixo"],
    ["stage_id inválido", "stage_id=1"],
    ["created_since inválido", "created_since=ontem"],
  ]) {
    r = await api(kRO, "GET", `/leads?${qs}`);
    check(`${nome} → 400`, r.status === 400, String(r.status));
  }
  const injecao = Buffer.from(`1 Jan 2026 (,id.gt.0)|${leadA.id}`).toString("base64url");
  r = await api(kRO, "GET", `/leads?cursor=${injecao}`);
  check("cursor com tentativa de injeção em filtro → 400", r.status === 400);
}

// ---------------------------------------------------------------------------
secao("5. isolamento entre empresas");
{
  const leadB = (await api(kB, "POST", "/leads", { name: "Só da B", email: "b@exemplo.com" })).json?.data;
  check("empresa B cria lead na etapa dela", leadB?.stage_id === etapasB["Novo B"]);
  let r = await api(kB, "GET", "/leads?limit=100");
  check("B só lista os leads dela", r.json?.data?.every((l) => l.id === leadB.id || l.name === "Idem B") && !r.json.data.some((l) => l.id === leadA.id));
  r = await api(kB, "GET", `/leads/${leadA.id}`);
  check("B lendo lead da A → 404 (igual a inexistente)", r.status === 404 && r.json?.error?.code === "not_found");
  r = await api(kB, "PATCH", `/leads/${leadA.id}`, { name: "INVADIDO" });
  check("B alterando lead da A → 404", r.status === 404);
  check("e o lead da A não mudou", sql(`select name from leads where id='${leadA.id}'`) === "Ana API");
  r = await api(kB, "PATCH", `/leads/${leadB.id}`, { stage_id: etapas["Proposta"] });
  check("B movendo o próprio lead para etapa da A → 422", r.status === 422, String(r.status));
  r = await api(kRW, "GET", `/leads/${leadB.id}`);
  check("A lendo lead da B → 404", r.status === 404);
  r = await api(kB, "GET", "/stages");
  check("etapas da B são as da B", r.json?.data?.length === 2 && r.json.data.every((s) => Object.values(etapasB).includes(s.id)));
  r = await api(kRW, "GET", `/leads/nao-e-uuid`);
  check("id malformado → 404", r.status === 404);
}

// ---------------------------------------------------------------------------
secao("6. atualizar e mover");
{
  const id = leadA.id;
  let r = await api(kRW, "PATCH", `/leads/${id}`, { city: "Vitória", deal_value: 2500, name: "Ana Atualizada" });
  check("PATCH simples → 200", r.status === 200 && r.json.data.city === "Vitória" && r.json.data.deal_value === 2500 && r.json.data.name === "Ana Atualizada", r.txt.slice(0, 150));
  r = await api(kRW, "PATCH", `/leads/${id}`, { city: null });
  check("null limpa o campo", r.json?.data?.city === null);
  r = await api(kRW, "PATCH", `/leads/${id}`, { custom_fields: { porte: "Micro", cargo: null } });
  const cf = r.json?.data?.custom_fields ?? {};
  check("custom_fields mescla e remove", Object.keys(cf).length === 2 && cf.faturamento === 1500.5 && cf.porte === "Micro" && !("cargo" in cf), JSON.stringify(cf));
  for (const [nome, corpo] of [
    ["corpo vazio", {}],
    ["utm_source (imutável)", { utm_source: "x" }],
    ["status direto", { status: "won" }],
    ["assigned_to", { assigned_to: B }],
  ]) {
    r = await api(kRW, "PATCH", `/leads/${id}`, corpo);
    check(`PATCH recusa ${nome} → 400`, r.status === 400, String(r.status));
  }

  const antes = sql(`select count(*) from lead_stage_history where lead_id='${id}'`);
  r = await api(kRW, "PATCH", `/leads/${id}`, { stage_id: etapas["Proposta"] });
  check("mover para etapa aberta", r.status === 200 && r.json.data.stage_id === etapas["Proposta"] && r.json.data.status === "contacted", r.txt.slice(0, 150));
  check("histórico de etapa gravado pelo gatilho", Number(sql(`select count(*) from lead_stage_history where lead_id='${id}'`)) === Number(antes) + 1);
  check("lead_events com o movimento", sql(`select count(*) from lead_events where lead_id='${id}' and event_type='stage_change'`) === "1");
  r = await api(kRW, "PATCH", `/leads/${id}`, { stage_id: etapas["Ganho"] });
  check("mover para etapa de ganho → status won", r.status === 200 && r.json.data.status === "won");
  r = await api(kRW, "PATCH", `/leads/${id}`, { stage_id: etapas["Novo"] });
  check("reabrir volta o status", r.json?.data?.status === "new");
  for (const m of ["DELETE", "PUT", "POST"]) {
    r = await api(kRW, m, `/leads/${id}`, m === "DELETE" ? undefined : {});
    check(`${m} /leads/:id → 405 em JSON com Allow`, r.status === 405 && r.json?.error?.code === "method_not_allowed" && /PATCH/.test(r.headers.get("allow") ?? ""), `${r.status} ${r.headers.get("content-type")}`);
  }
  for (const m of ["DELETE", "PUT", "PATCH"]) {
    r = await api(kRW, m, "/leads", m === "DELETE" ? undefined : {});
    check(`${m} /leads → 405`, r.status === 405, String(r.status));
  }
  r = await api(kRW, "POST", "/stages", {});
  check("POST /stages → 405", r.status === 405);
  check("nada foi apagado pelos métodos recusados", sql(`select count(*) from leads where id='${id}'`) === "1");
}

// ---------------------------------------------------------------------------
secao("7. webhooks enfileirados pelo banco");
{
  sql(`insert into webhook_endpoints (company_id, nome, url, segredo, eventos) values ('${A}','e2e-hook','https://destino.exemplo.com/h','whsec_e2e','{lead.created,lead.stage_changed}')`);
  const n0 = Number(sql(`select count(*) from webhook_deliveries`));
  const c = await api(kRW, "POST", "/leads", { name: "Dispara webhook" });
  check("criar pela API enfileira lead.created", Number(sql(`select count(*) from webhook_deliveries where evento='lead.created'`)) >= 1 && Number(sql(`select count(*) from webhook_deliveries`)) === n0 + 1);
  await api(kRW, "PATCH", `/leads/${c.json.data.id}`, { stage_id: etapas["Proposta"] });
  const p = sql(`select payload->'data'->'to_stage'->>'name' || '|' || (payload->'data'->'lead'->>'id') from webhook_deliveries where evento='lead.stage_changed' order by criada_em desc limit 1`);
  check("mover enfileira lead.stage_changed com a etapa de destino", p === `Proposta|${c.json.data.id}`, p);
  await api(kRW, "PATCH", `/leads/${c.json.data.id}`, { name: "Só o nome" });
  check("editar só o nome NÃO enfileira nada", Number(sql(`select count(*) from webhook_deliveries`)) === n0 + 2);
  sql(`update webhook_endpoints set ativo=false where nome='e2e-hook'`);
  await api(kRW, "POST", "/leads", { name: "Sem destino ativo" });
  check("endpoint desativado não recebe", Number(sql(`select count(*) from webhook_deliveries`)) === n0 + 2);
  sql(`delete from webhook_endpoints where nome='e2e-hook'`);
}

// ---------------------------------------------------------------------------
secao("8. limite de taxa");
{
  const kRate = novaChave("e2e-rate", A, "leads:read");
  const codigos = [];
  let primeiro429 = null;
  for (let i = 1; i <= 125; i++) {
    const r = await api(kRate, "GET", "/stages");
    codigos.push(r.status);
    if (r.status === 429 && !primeiro429) primeiro429 = r;
  }
  const oks = codigos.filter((c) => c === 200).length;
  const viradaDeMinuto = codigos.slice(121).includes(200); // se o minuto virou no meio, o contador zera
  check("120 passam e o resto é barrado", viradaDeMinuto || (oks === 120 && codigos.filter((c) => c === 429).length === 5), `200=${oks} 429=${codigos.filter((c) => c === 429).length}`);
  check("429 traz Retry-After e código", !!primeiro429 && Number(primeiro429.headers.get("retry-after")) >= 1 && primeiro429.json?.error?.code === "rate_limited");
  const outra = await api(kRO, "GET", "/stages");
  check("o limite é por chave (outra chave segue livre)", outra.status === 200);
}

// ---------------------------------------------------------------------------
secao("9. plano (espera 31 s pelo cache de 30 s do servidor)");
{
  const plano = (p, st = "ativo") => sql(`update company_plans set plano='${p}', status='${st}' where company_id='${B}'`);
  const antes = await api(kB, "GET", "/stages");
  check("com plano Escala a API responde", antes.status === 200);
  plano("essencial");
  await new Promise((r) => setTimeout(r, 31_000));
  let r = await api(kB, "GET", "/stages");
  check("plano Essencial → 403 feature_not_available", r.status === 403 && r.json?.error?.code === "feature_not_available", `${r.status} ${r.txt.slice(0, 80)}`);
  r = await api(kB, "POST", "/leads", { name: "não deve entrar" });
  check("e também não cria lead", r.status === 403 && sql(`select count(*) from leads where company_id='${B}' and name='não deve entrar'`) === "0");
  const ok_a = await api(kRO, "GET", "/stages");
  check("o bloqueio é por empresa (A segue liberada)", ok_a.status === 200);
  plano("escala", "suspenso");
  await new Promise((r) => setTimeout(r, 31_000));
  r = await api(kB, "GET", "/stages");
  check("plano suspenso volta ao básico → 403", r.status === 403, String(r.status));
  plano("escala");
  await new Promise((r) => setTimeout(r, 31_000));
  r = await api(kB, "GET", "/stages");
  check("regularizado, volta a responder", r.status === 200, String(r.status));
}

console.log(`\n${ok} verificações ok, ${falhas.length} falhas`);
if (falhas.length) {
  console.log("FALHARAM:\n - " + falhas.join("\n - "));
  process.exit(1);
}
