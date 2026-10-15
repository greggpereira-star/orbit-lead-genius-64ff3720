/**
 * Mídia do WhatsApp: o que chega, o que pode ir, e como guardar.
 *
 * Duas fontes de limite, nomeadas:
 *   [meta]  MEDIA.md do repositório de referência — imagem 5 MB (JPEG/PNG),
 *           vídeo 16 MB (MP4), áudio 16 MB (AAC/MP3/OGG/AMR), documento 100 MB.
 *   [nosso] o bucket aceita 25 MB; documento é limitado a 20 MB para caber nele.
 */

import type { Referral } from "./payload";

export type TipoDeMidia = "image" | "audio" | "video" | "document" | "sticker";

const TIPOS_DE_MIDIA: readonly string[] = ["image", "audio", "video", "document", "sticker"];

export const LIMITE_DE_DOWNLOAD = 20 * 1024 * 1024; // [nosso]

export interface MidiaRecebida {
  kind: TipoDeMidia;
  providerMediaId: string;
  mime: string | null;
  sha256: string | null;
  filename: string | null;
  /** Áudio gravado na hora (nota de voz) × arquivo de áudio. */
  voz: boolean;
}

const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Lê a mídia de uma mensagem recebida. `null` quando o tipo não é de mídia. */
export function extrairMidia(tipo: string, payload: Record<string, unknown>): MidiaRecebida | null {
  if (!TIPOS_DE_MIDIA.includes(tipo)) return null;
  const m = payload[tipo];
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  const id = txt(o.id);
  if (!id) return null;
  return {
    kind: tipo as TipoDeMidia,
    providerMediaId: id,
    mime: txt(o.mime_type),
    sha256: txt(o.sha256),
    filename: txt(o.filename),
    voz: o.voice === true,
  };
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------
const MB = 1024 * 1024;

const REGRAS_DE_ENVIO: Record<
  Exclude<TipoDeMidia, "sticker">,
  { mimes: readonly string[] | null; max: number; rotulo: string }
> = {
  image: {
    mimes: ["image/jpeg", "image/png"],
    max: 5 * MB,
    rotulo: "Imagem (JPEG ou PNG, até 5 MB)",
  },
  video: { mimes: ["video/mp4", "video/3gpp"], max: 16 * MB, rotulo: "Vídeo (MP4, até 16 MB)" },
  audio: {
    mimes: ["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"],
    max: 16 * MB,
    rotulo: "Áudio (AAC, MP3, OGG ou AMR, até 16 MB)",
  },
  document: { mimes: null, max: 20 * MB, rotulo: "Documento (até 20 MB)" },
};

export type ArquivoParaEnvio =
  { ok: true; tipo: Exclude<TipoDeMidia, "sticker"> } | { ok: false; texto: string };

/**
 * Decide o TIPO de mensagem pelo arquivo, e recusa o que a Meta recusaria —
 * antes de gastar o upload. Imagem/vídeo/áudio fora dos formatos aceitos NÃO é
 * convertido em documento sem avisar: o autor escolhe.
 */
export function classificarArquivoParaEnvio(a: {
  mime: string;
  bytes: number;
  forcarDocumento?: boolean;
}): ArquivoParaEnvio {
  const mime = a.mime.split(";")[0].trim().toLowerCase();
  if (!mime) return { ok: false, texto: "Tipo de arquivo desconhecido." };
  if (!Number.isFinite(a.bytes) || a.bytes <= 0) return { ok: false, texto: "Arquivo vazio." };

  const familia = mime.split("/")[0];
  const tipo: Exclude<TipoDeMidia, "sticker"> =
    a.forcarDocumento || !["image", "video", "audio"].includes(familia)
      ? "document"
      : (familia as "image" | "video" | "audio");

  const regra = REGRAS_DE_ENVIO[tipo];
  if (regra.mimes && !regra.mimes.includes(mime)) {
    return {
      ok: false,
      texto: `Formato ${mime} não é aceito. ${regra.rotulo}. Para enviar assim mesmo, mande como documento.`,
    };
  }
  if (a.bytes > regra.max) {
    return {
      ok: false,
      texto: `Arquivo grande demais (${(a.bytes / MB).toFixed(1)} MB). ${regra.rotulo}.`,
    };
  }
  return { ok: true, tipo };
}

/** Nome de arquivo sem nada que vire caminho ou cabeçalho. */
export function nomeSeguro(nome: string): string {
  const base = nome.split(/[\\/]/).pop() ?? "arquivo";
  const limpo = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 80);
  return limpo || "arquivo";
}

/** Caminho no bucket. O prefixo é a EMPRESA: é o que a conferência de posse usa. */
export function caminhoDeSaida(companyId: string, nome: string, id: string): string {
  return `${companyId}/saida/${id}-${nomeSeguro(nome)}`;
}

export function caminhoDeEntrada(
  companyId: string,
  providerMediaId: string,
  mime: string | null,
): string {
  return `${companyId}/entrada/${nomeSeguro(providerMediaId)}${extensaoDoMime(mime)}`;
}

export function extensaoDoMime(mime: string | null): string {
  switch ((mime ?? "").split(";")[0].trim().toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "video/mp4":
      return ".mp4";
    case "audio/ogg":
      return ".ogg";
    case "audio/mpeg":
      return ".mp3";
    case "audio/aac":
      return ".aac";
    case "audio/mp4":
      return ".m4a";
    case "audio/amr":
      return ".amr";
    case "application/pdf":
      return ".pdf";
    default:
      return "";
  }
}

/** O caminho pertence à empresa? (Caminho vem do navegador: nunca é confiável.) */
export function caminhoEhDaEmpresa(caminho: string, companyId: string): boolean {
  return (
    caminho.startsWith(`${companyId}/saida/`) &&
    !caminho.includes("..") &&
    !caminho.includes("//") &&
    caminho.length <= 300
  );
}

/** Referral não é mídia, mas mora aqui por vir junto no mesmo payload. */
export type { Referral };

/**
 * A URL de download vem na resposta da Meta e o download leva o TOKEN da conta.
 * Só seguimos para https em domínio da Meta — qualquer outra coisa (IP, rede
 * interna, domínio de terceiros) não recebe a credencial.
 */
const DOMINIOS_DE_MIDIA_DA_META = ["fbsbx.com", "fbcdn.net", "facebook.com", "whatsapp.net"];

export function urlDeMidiaDaMetaEhSegura(valor: string): boolean {
  let u: URL;
  try {
    u = new URL(valor);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return DOMINIOS_DE_MIDIA_DA_META.some((d) => host === d || host.endsWith(`.${d}`));
}

/** Lê o corpo parando no teto: `arrayBuffer()` bufferiza tudo antes de se poder conferir. */
export async function lerCorpoComTeto(res: Response, teto: number): Promise<ArrayBuffer | null> {
  const declarado = Number(res.headers.get("content-length") ?? "0");
  if (Number.isFinite(declarado) && declarado > teto) return null;
  if (!res.body) {
    const b = await res.arrayBuffer();
    return b.byteLength > teto ? null : b;
  }
  const leitor = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > teto) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  const saida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    saida.set(p, pos);
    pos += p.byteLength;
  }
  return saida.buffer as ArrayBuffer;
}
