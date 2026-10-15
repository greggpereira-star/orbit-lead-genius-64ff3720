/**
 * Guarda e serve a mídia do WhatsApp.
 *
 * Mídia RECEBIDA é baixada da Meta e copiada para o bucket privado `wa-media`:
 * a URL da Meta expira em minutos e o id não vale para sempre — servir de lá faz
 * a imagem "sumir" da conversa. Antes de guardar, o `sha256` informado pela Meta
 * é conferido contra os bytes recebidos.
 *
 * A tela nunca lê o bucket: pede uma URL assinada curta, e quem assina confere a
 * empresa dona da mídia.
 */

import { contaDaEmpresa } from "./onboarding";
import { lerMetadadosDaMidia } from "./graph";
import {
  caminhoDeEntrada,
  LIMITE_DE_DOWNLOAD,
  lerCorpoComTeto,
  urlDeMidiaDaMetaEhSegura,
} from "./midia";
import type { DbWa } from "./processador";

export const BUCKET = "wa-media";

export interface Armazenamento {
  from(bucket: string): {
    upload(
      caminho: string,
      corpo: ArrayBuffer | Uint8Array,
      opcoes?: { contentType?: string; upsert?: boolean },
    ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    createSignedUrl(
      caminho: string,
      segundos: number,
    ): PromiseLike<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    createSignedUploadUrl(caminho: string): PromiseLike<{
      data: { signedUrl: string; token: string; path: string } | null;
      error: { message: string } | null;
    }>;
  };
}

export type DbComArmazenamento = DbWa & { storage: Armazenamento };

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabela = (db: DbWa, nome: string): any => db.from(nome);

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type ResultadoDoDownload =
  | { ok: true; caminho: string; jaGuardada: boolean }
  | { ok: false; texto: string; expirou: boolean };

export async function baixarEGuardarMidia(
  db: DbComArmazenamento,
  mediaId: string,
): Promise<ResultadoDoDownload> {
  const { data: m } = await tabela(db, "wa_media")
    .select("id, company_id, provider_media_id, mime, sha256, status, storage_path, attempts")
    .eq("id", mediaId)
    .maybeSingle();
  if (!m) return { ok: false, texto: "Mídia não encontrada.", expirou: false };
  if (m.status === "stored" && m.storage_path)
    return { ok: true, caminho: m.storage_path, jaGuardada: true };
  if (!m.provider_media_id)
    return { ok: false, texto: "Mídia sem identificador da Meta.", expirou: false };

  const falhou = async (texto: string, expirou = false): Promise<ResultadoDoDownload> => {
    await tabela(db, "wa_media")
      .update({
        status: expirou ? "expired" : "failed",
        error: texto.slice(0, 300),
        attempts: (m.attempts ?? 0) + 1,
      })
      .eq("id", mediaId);
    return { ok: false, texto, expirou };
  };

  const conta = await contaDaEmpresa(db, m.company_id);
  if (!conta) return falhou("Conta do WhatsApp sem credencial.");

  // 1) URL temporária
  const meta = await lerMetadadosDaMidia(m.provider_media_id, conta.token);
  if (!meta.ok || !meta.data.url) {
    const expirou = !meta.ok && (meta.erro.http === 404 || meta.erro.http === 410);
    return falhou(meta.ok ? "A Meta não devolveu a URL da mídia." : meta.erro.mensagem, expirou);
  }
  if (typeof meta.data.file_size === "number" && meta.data.file_size > LIMITE_DE_DOWNLOAD) {
    return falhou(`Arquivo grande demais (${Math.round(meta.data.file_size / 1048576)} MB).`);
  }

  // 2) bytes (a URL exige o mesmo token, por isso só vai a domínio da Meta)
  if (!urlDeMidiaDaMetaEhSegura(meta.data.url))
    return falhou("A URL de download não é de um domínio da Meta.");
  let bytes: ArrayBuffer;
  try {
    const res = await fetch(meta.data.url, {
      headers: { Authorization: `Bearer ${conta.token}` },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400)
      return falhou("Redirecionamento no download recusado.");
    if (!res.ok)
      return falhou(`Download recusado (${res.status}).`, res.status === 404 || res.status === 410);
    const lido = await lerCorpoComTeto(res, LIMITE_DE_DOWNLOAD);
    if (!lido) return falhou("Arquivo grande demais.");
    bytes = lido;
  } catch (e) {
    return falhou(e instanceof Error ? e.message : "Falha no download.");
  }
  if (bytes.byteLength === 0) return falhou("Arquivo vazio.");
  if (bytes.byteLength > LIMITE_DE_DOWNLOAD) return falhou("Arquivo grande demais.");

  // 3) integridade: o que a Meta disse × o que chegou
  const esperado = (meta.data.sha256 ?? m.sha256 ?? "").toLowerCase();
  if (esperado) {
    const real = await sha256Hex(bytes);
    // A Meta entrega o sha256 em hex; se vier noutro formato, não bloqueia.
    if (/^[0-9a-f]{64}$/.test(esperado) && real !== esperado) {
      return falhou("Arquivo corrompido: o hash não confere.");
    }
  }

  // 4) bucket
  const mime = meta.data.mime_type ?? m.mime ?? "application/octet-stream";
  const caminho = caminhoDeEntrada(m.company_id, m.provider_media_id, mime);
  const up = await db.storage
    .from(BUCKET)
    .upload(caminho, bytes, { contentType: mime, upsert: true });
  if (up.error) return falhou(`Não consegui guardar o arquivo: ${up.error.message}`);

  await tabela(db, "wa_media")
    .update({
      status: "stored",
      storage_path: caminho,
      mime,
      size_bytes: bytes.byteLength,
      fetched_at: new Date().toISOString(),
      error: null,
      attempts: (m.attempts ?? 0) + 1,
    })
    .eq("id", mediaId);
  return { ok: true, caminho, jaGuardada: false };
}

export type ResultadoDaUrl =
  | { ok: true; url: string; mime: string | null; nome: string | null; tipo: string | null }
  | { ok: false; texto: string; estado: "indisponivel" | "falhou" | "inexistente" };

/**
 * URL assinada curta para a tela. A mídia precisa ser da EMPRESA informada
 * (que vem da sessão): o id da mídia chega do navegador e não prova nada.
 */
export async function urlDaMidia(
  db: DbComArmazenamento,
  companyId: string,
  mediaId: string,
  segundos = 600,
): Promise<ResultadoDaUrl> {
  const { data: m } = await tabela(db, "wa_media")
    .select("id, company_id, mime, filename, kind, status, storage_path")
    .eq("id", mediaId)
    .maybeSingle();
  if (!m || m.company_id !== companyId)
    return { ok: false, texto: "Mídia não encontrada.", estado: "inexistente" };

  let caminho: string | null = m.status === "stored" ? m.storage_path : null;
  if (!caminho) {
    const r = await baixarEGuardarMidia(db, mediaId);
    if (!r.ok) {
      return {
        ok: false,
        texto: r.expirou ? "A Meta já não disponibiliza esta mídia." : r.texto,
        estado: r.expirou ? "indisponivel" : "falhou",
      };
    }
    caminho = r.caminho;
  }

  const s = await db.storage.from(BUCKET).createSignedUrl(caminho, segundos);
  if (s.error || !s.data)
    return { ok: false, texto: "Não consegui gerar o link da mídia.", estado: "falhou" };
  return {
    ok: true,
    url: s.data.signedUrl,
    mime: m.mime ?? null,
    nome: m.filename ?? null,
    tipo: m.kind ?? null,
  };
}
