import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra de token em repouso (AES-256-GCM).
 *
 * O token do WhatsApp é de longa duração e dá acesso ao envio da empresa. Mesmo
 * com a tabela fora do alcance do navegador, um dump do banco não pode entregá-lo
 * em texto puro. A chave vem de `WA_TOKEN_KEY` (32 bytes em base64) e FALHA
 * FECHADO: sem chave válida, nada é cifrado nem decifrado.
 *
 * Formato: `v1.<iv>.<tag>.<cifrado>` (base64url).
 */
const PREFIXO = "v1";

function chave(entrada?: string): Buffer {
  const bruta = entrada ?? process.env.WA_TOKEN_KEY ?? "";
  const buf = Buffer.from(bruta, "base64");
  if (buf.length !== 32) {
    throw new Error("WA_TOKEN_KEY ausente ou inválida (esperado: 32 bytes em base64).");
  }
  return buf;
}

export function cifrarToken(claro: string, chaveBase64?: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(chaveBase64), iv);
  const cifrado = Buffer.concat([c.update(claro, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return [
    PREFIXO,
    iv.toString("base64url"),
    tag.toString("base64url"),
    cifrado.toString("base64url"),
  ].join(".");
}

export function decifrarToken(texto: string, chaveBase64?: string): string {
  const [v, iv, tag, cifrado] = texto.split(".");
  if (v !== PREFIXO || !iv || !tag || !cifrado)
    throw new Error("Token cifrado em formato desconhecido.");
  const d = createDecipheriv("aes-256-gcm", chave(chaveBase64), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(cifrado, "base64url")), d.final()]).toString("utf8");
}
