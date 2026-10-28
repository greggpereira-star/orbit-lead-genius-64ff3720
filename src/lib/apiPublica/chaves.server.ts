import { createHash, randomBytes } from "node:crypto";

/**
 * Chave de API da empresa.
 *
 * Formato: `alf_` + 43 caracteres base64url (256 bits de entropia). Com essa
 * entropia basta SHA-256 sem sal — não há dicionário para atacar, e o hash
 * determinístico permite achar a chave por índice em vez de varrer a tabela.
 *
 * A chave inteira existe em claro UMA vez: na resposta da criação. O banco guarda
 * o hash e um prefixo curto que só serve para o dono reconhecer a chave na lista.
 */
export const PREFIXO_DA_CHAVE = "alf_";
const FORMATO = /^alf_[A-Za-z0-9_-]{43}$/;
const TAMANHO_DO_PREFIXO_VISIVEL = 8;

export function hashDaChave(chave: string): string {
  return createHash("sha256").update(chave, "utf8").digest("hex");
}

export function gerarChave(): { chave: string; prefixo: string; hash: string } {
  const chave = PREFIXO_DA_CHAVE + randomBytes(32).toString("base64url");
  return { chave, prefixo: prefixoVisivel(chave), hash: hashDaChave(chave) };
}

export function prefixoVisivel(chave: string): string {
  return chave.slice(0, PREFIXO_DA_CHAVE.length + TAMANHO_DO_PREFIXO_VISIVEL);
}

export function pareceChave(valor: string): boolean {
  return FORMATO.test(valor);
}

/**
 * Extrai a chave do cabeçalho `Authorization: Bearer …`.
 * Só aceita o formato exato: lixo no cabeçalho nem chega ao banco.
 */
export function chaveDoCabecalho(authorization: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec((authorization ?? "").trim());
  if (!m) return null;
  return pareceChave(m[1]) ? m[1] : null;
}
