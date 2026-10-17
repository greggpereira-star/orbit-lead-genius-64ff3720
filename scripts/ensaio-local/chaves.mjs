/** Segredos FALSOS do ensaio local (nada aqui vale fora de 127.0.0.1). */
import { createHmac, createHash } from "node:crypto";

export const SEGREDO_JWT = "ensaio-local-segredo-jwt-com-mais-de-32-caracteres";
export const SENHA_DOS_USUARIOS = "ensaio-senha";
export const META_APP_SECRET = "ensaio-segredo-do-app-meta";
export const WA_VERIFY_TOKEN = "ensaio-verify-token";
/** 32 bytes fixos em base64: só para o ensaio. */
export const WA_TOKEN_KEY = createHash("sha256").update("ensaio-wa-token-key").digest("base64");

const b64 = (b) => Buffer.from(b).toString("base64url");
export function assinarJwt(claims, segredo = SEGREDO_JWT) {
  const h = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64(JSON.stringify(claims));
  return `${h}.${p}.${createHmac("sha256", segredo).update(`${h}.${p}`).digest("base64url")}`;
}
export function verificarJwt(token, segredo = SEGREDO_JWT) {
  const [h, p, s] = String(token).split(".");
  if (!h || !p || !s) return null;
  const esperado = createHmac("sha256", segredo).update(`${h}.${p}`).digest("base64url");
  if (esperado !== s) return null;
  const c = JSON.parse(Buffer.from(p, "base64url").toString());
  return c.exp && c.exp < Date.now() / 1000 ? null : c;
}
const longo = 60 * 60 * 24 * 365;
export const CHAVE_ANON = assinarJwt({ role: "anon", iss: "ensaio", iat: 1700000000, exp: 4102444800 });
export const CHAVE_SERVICE = assinarJwt({ role: "service_role", iss: "ensaio", iat: 1700000000, exp: 4102444800 });
export const jwtDoUsuario = (u, validade = 3600) => assinarJwt({
  aud: "authenticated", role: "authenticated", sub: u.id, email: u.email,
  iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + validade, session_id: u.id,
  app_metadata: { provider: "email" }, user_metadata: u.raw_user_meta_data ?? {},
});
export { longo };
