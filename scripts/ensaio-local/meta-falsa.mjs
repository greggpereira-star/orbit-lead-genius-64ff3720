/**
 * Meta falsa: imita, em memória, as chamadas da Graph API que o módulo WhatsApp
 * faz. SÓ para ensaio. Foi escrita a partir da documentação e do que o código
 * chama — por isso prova que o código fala o protocolo que ENTENDEMOS, não que
 * a Meta se comporta assim. O que só a Meta pode confirmar continua [VERIFICAR].
 *
 * Números de destino com comportamento combinado (final do telefone):
 *   ...0047  → erro 131047 (fora da janela de 24 h)
 *   ...0030  → erro 131030 (número não está no WhatsApp)
 *   ...0050  → erro 131050 (parou de receber marketing)
 *   ...0429  → erro 130429 (limite de taxa)
 *   ...0500  → HTTP 503 (instável)
 * Token "TOKEN_EXPIRADO" → erro 190. Qualquer outro token vale.
 */
import { createServer } from "node:http";
import { createHmac, randomUUID } from "node:crypto";

export function criarMetaFalsa({ porta = 0 } = {}) {
  const chamadas = [];
  const templates = new Map(); // waba -> [{id,name,language,category,status,components}]
  const numeros = new Map([["PNID_TESTE", { id: "PNID_TESTE", display_phone_number: "+55 27 90000-0000", verified_name: "Empresa Ensaio", quality_rating: "GREEN", messaging_limit_tier: "TIER_1K", platform_type: "CLOUD_API", is_on_biz_app: true, code_verification_status: "VERIFIED" }]]);
  const midias = new Map(); // id -> {mime, bytes}
  let base = "";

  const json = (res, status, obj) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  const erro = (res, http, code, message) => json(res, http, { error: { message, type: "OAuthException", code, fbtrace_id: "FBT" + randomUUID().slice(0, 8) } });
  const lerCorpo = (req) => new Promise((ok) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch { ok({ _naoJson: b }); } }); });

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const partes = url.pathname.split("/").filter(Boolean);
    const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    const corpo = req.method === "GET" || req.method === "DELETE" ? {} : await lerCorpo(req);
    if (!url.pathname.startsWith("/_")) chamadas.push({ metodo: req.method, caminho: url.pathname, query: Object.fromEntries(url.searchParams), corpo, token: token ? "<presente>" : null });

    // --- controle do ensaio
    if (url.pathname === "/_chamadas") return json(res, 200, chamadas);
    if (url.pathname === "/_reset") { chamadas.length = 0; templates.clear(); return json(res, 200, { ok: true }); }
    if (url.pathname === "/_midia" && req.method === "POST") { midias.set(corpo.id, { mime: corpo.mime, bytes: Buffer.from(corpo.base64, "base64") }); return json(res, 200, { ok: true }); }
    if (partes[0] === "baixar" && midias.has(partes[1])) {
      const m = midias.get(partes[1]);
      if (!token) return erro(res, 401, 190, "Sem token");
      res.writeHead(200, { "content-type": m.mime }); return res.end(m.bytes);
    }

    // --- API (prefixo de versão opcional: /v25.0/...)
    const caminho = /^v\d+\.\d+$/.test(partes[0] ?? "") ? partes.slice(1) : partes;
    if (token === "TOKEN_EXPIRADO") return erro(res, 401, 190, "Error validating access token: Session has expired");

    if (caminho[0] === "oauth" && caminho[1] === "access_token") {
      if (!url.searchParams.get("code")) return erro(res, 400, 100, "Missing code");
      return json(res, 200, { access_token: "TOKEN_DA_EMPRESA_" + randomUUID().slice(0, 6), token_type: "bearer", expires_in: 5184000 });
    }
    const [id, recurso] = caminho;
    if (recurso === "messages" && req.method === "POST") {
      const para = String(corpo.to ?? "");
      if (para.endsWith("0047")) return erro(res, 400, 131047, "Re-engagement message");
      if (para.endsWith("0030")) return erro(res, 400, 131030, "Recipient phone number not in allowed list");
      if (para.endsWith("0050")) return erro(res, 400, 131050, "User opted out of marketing");
      if (para.endsWith("0429")) return erro(res, 429, 130429, "Rate limit hit");
      if (para.endsWith("0500")) return json(res, 503, { error: { message: "Service unavailable", code: 2 } });
      if (!corpo.type || !(corpo[corpo.type])) return erro(res, 400, 100, "Invalid parameter");
      return json(res, 200, { messaging_product: "whatsapp", contacts: [{ input: para, wa_id: para }], messages: [{ id: "wamid.FAKE" + randomUUID().replace(/-/g, "").slice(0, 20) }] });
    }
    if (recurso === "subscribed_apps") return req.method === "POST" ? json(res, 200, { success: true }) : json(res, 200, { data: [] });
    if (recurso === "message_templates") {
      const lista = templates.get(id) ?? [];
      if (req.method === "GET") return json(res, 200, { data: lista });
      if (req.method === "POST") {
        if (!corpo.name || !/^[a-z0-9_]+$/.test(corpo.name)) return erro(res, 400, 100, "Invalid template name");
        const t = { id: String(Date.now()) + lista.length, name: corpo.name, language: corpo.language, category: corpo.category, status: "PENDING", components: corpo.components ?? [] };
        templates.set(id, [...lista, t]); return json(res, 200, { id: t.id, status: "PENDING", category: corpo.category });
      }
      if (req.method === "DELETE") { templates.set(id, lista.filter((t) => t.name !== url.searchParams.get("name"))); return json(res, 200, { success: true }); }
    }
    if (recurso === "smb_app_data" && req.method === "POST") return json(res, 200, { messaging_product: "whatsapp", request_id: "REQ" + randomUUID().slice(0, 6) });
    if (!recurso && req.method === "GET") {
      if (midias.has(id)) { const m = midias.get(id); return json(res, 200, { id, url: `${base}/baixar/${id}`, mime_type: m.mime, file_size: m.bytes.length, sha256: "x" }); }
      const n = numeros.get(id); if (n) return json(res, 200, n);
      return erro(res, 400, 100, `Unsupported get request. Object with ID '${id}' does not exist`);
    }
    return erro(res, 404, 100, "Unsupported request");
  });

  return {
    chamadas, templates, numeros,
    iniciar: () => new Promise((ok) => servidor.listen(porta, "127.0.0.1", () => { base = `http://127.0.0.1:${servidor.address().port}`; ok(base); })),
    parar: () => new Promise((ok) => servidor.close(() => ok())),
    aprovarTemplate(waba, nome, status = "APPROVED") { templates.set(waba, (templates.get(waba) ?? []).map((t) => (t.name === nome ? { ...t, status } : t))); },
    guardarMidia(id, mime, bytes) { midias.set(id, { mime, bytes }); },
    get base() { return base; },
  };
}

/** Assina um corpo como a Meta (X-Hub-Signature-256 = sha256=HMAC(corpo, segredo do app)). */
export function assinar(corpoCru, segredo) {
  return "sha256=" + createHmac("sha256", segredo).update(corpoCru).digest("hex");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const m = criarMetaFalsa({ porta: Number(process.env.PORT ?? 9911) });
  m.iniciar().then((b) => console.log("Meta falsa em", b, "— use META_GRAPH_BASE_URL=" + b + "/v25.0"));
}
