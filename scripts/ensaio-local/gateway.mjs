/**
 * Gateway do ensaio local: junta, numa porta só, o que o supabase-js espera do
 * Supabase — /rest/v1 (PostgREST real), /auth/v1 (login falso, HS256) e
 * /storage/v1 (arquivos em disco). SÓ 127.0.0.1. Não é segurança: é conveniência.
 */
import { createServer, request as httpRequest } from "node:http";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { SENHA_DOS_USUARIOS, jwtDoUsuario, verificarJwt } from "./chaves.mjs";

const PORTA = Number(process.env.GATEWAY_PORT ?? 54321);
const POSTGREST = Number(process.env.POSTGREST_PORT ?? 54322);
const PG = process.env.ENSAIO_PG ?? "postgres://postgres@127.0.0.1:54329/leadflow_ensaio";
const ARQUIVOS = process.env.ENSAIO_ARQUIVOS ?? join(process.env.TMPDIR ?? "/tmp", "leadflow-ensaio-arquivos");
const sql = postgres(PG, { max: 2, onnotice: () => {} });

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS", "access-control-expose-headers": "*" };
const json = (res, status, obj) => { res.writeHead(status, { "content-type": "application/json", ...cors }); res.end(JSON.stringify(obj)); };
const corpo = (req) => new Promise((ok) => { const b = []; req.on("data", (c) => b.push(c)); req.on("end", () => ok(Buffer.concat(b))); });
const jsonDe = (buf) => { try { return JSON.parse(buf.toString() || "{}"); } catch { return {}; } };
const usuarioPorId = async (id) => (await sql`select id, email, raw_user_meta_data, created_at from auth.users where id = ${id}`)[0];
const objUsuario = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, email_confirmed_at: u.created_at, app_metadata: { provider: "email", providers: ["email"] }, user_metadata: u.raw_user_meta_data ?? {}, identities: [], created_at: u.created_at, updated_at: u.created_at });
const sessao = (u) => ({ access_token: jwtDoUsuario(u), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: Buffer.from(u.id).toString("base64url"), user: objUsuario(u) });

createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, "http://x");
  const p = url.pathname;
  try {
    // ---------------- REST: PostgREST de verdade
    if (p.startsWith("/rest/v1")) {
      const dados = await corpo(req);
      const headers = { ...req.headers, host: `127.0.0.1:${POSTGREST}` };
      delete headers["content-length"]; delete headers["accept-encoding"];
      if (dados.length) headers["content-length"] = String(dados.length);
      const destino = httpRequest({ host: "127.0.0.1", port: POSTGREST, method: req.method, path: p.replace(/^\/rest\/v1/, "") + url.search, headers }, (r) => {
        res.writeHead(r.statusCode, { ...r.headers, ...cors }); r.pipe(res);
      });
      destino.on("error", (e) => json(res, 502, { message: "PostgREST fora do ar: " + e.message }));
      destino.end(dados); return;
    }
    // ---------------- AUTH falso
    if (p === "/auth/v1/settings") return json(res, 200, { external: { email: true }, disable_signup: true, mailer_autoconfirm: true });
    if (p === "/auth/v1/.well-known/jwks.json") return json(res, 200, { keys: [] });
    if (p === "/auth/v1/token" && req.method === "POST") {
      const b = jsonDe(await corpo(req));
      const tipo = url.searchParams.get("grant_type");
      if (tipo === "password") {
        const [u] = await sql`select id, email, raw_user_meta_data, created_at from auth.users where lower(email) = lower(${b.email ?? ""})`;
        if (!u || b.password !== SENHA_DOS_USUARIOS) return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
        return json(res, 200, sessao(u));
      }
      if (tipo === "refresh_token") {
        const u = await usuarioPorId(Buffer.from(String(b.refresh_token ?? ""), "base64url").toString());
        return u ? json(res, 200, sessao(u)) : json(res, 400, { error: "invalid_grant", error_description: "Invalid Refresh Token" });
      }
      return json(res, 400, { error: "unsupported_grant_type" });
    }
    if (p === "/auth/v1/user") {
      const c = verificarJwt((req.headers.authorization ?? "").replace(/^Bearer /, ""));
      if (!c?.sub) return json(res, 401, { code: 401, msg: "invalid JWT" });
      const u = await usuarioPorId(c.sub);
      return u ? json(res, 200, objUsuario(u)) : json(res, 404, { msg: "User not found" });
    }
    if (p === "/auth/v1/logout") { res.writeHead(204, cors); return res.end(); }
    // ---------------- STORAGE em disco
    const m = p.match(/^\/storage\/v1\/object\/(?:(sign|public|authenticated)\/)?([^/]+)\/(.+)$/);
    if (m) {
      const [, modo, bucket, caminho] = m;
      const arq = join(ARQUIVOS, bucket, decodeURIComponent(caminho));
      if (req.method === "POST" && modo === "sign") {
        return json(res, 200, { signedURL: `/object/sign/${bucket}/${caminho}?token=ensaio` });
      }
      if (req.method === "POST" || req.method === "PUT") {
        const dados = await corpo(req);
        mkdirSync(dirname(arq), { recursive: true }); writeFileSync(arq, dados);
        return json(res, 200, { Key: `${bucket}/${caminho}`, Id: caminho });
      }
      if (req.method === "GET" || req.method === "HEAD") {
        if (!existsSync(arq)) return json(res, 404, { statusCode: "404", error: "not_found", message: "Object not found" });
        res.writeHead(200, { "content-type": "application/octet-stream", ...cors });
        return res.end(req.method === "HEAD" ? undefined : readFileSync(arq));
      }
    }
    return json(res, 404, { message: "rota não simulada pelo gateway: " + p });
  } catch (e) { return json(res, 500, { message: String(e?.message ?? e) }); }
}).listen(PORTA, "127.0.0.1", () => console.log(`Gateway em http://127.0.0.1:${PORTA}`));
