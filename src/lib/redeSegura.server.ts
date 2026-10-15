/**
 * Destino de webhook configurado por membro da empresa: o SERVIDOR faz a
 * requisição, então a URL é entrada não confiável.
 *
 * Sem estas checagens, `https://atacante.com` respondia 302 para
 * `http://169.254.169.254/` ou `http://kong:8000/` e o servidor seguia — e o
 * status voltava na tela de execuções, virando um sondador de rede interna.
 *
 * Limite conhecido: a resolução de DNS aqui e a do `fetch` são duas. Um domínio
 * que troca de IP entre as duas (DNS rebinding) escapa; fechar de vez exige
 * conectar direto no IP validado (agente HTTP dedicado) ou um proxy de saída.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** `true` para loopback, privado, link-local, CGNAT, multicast, reservado. */
export function ehEnderecoPrivado(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local / metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) || // 192.0.0.0/24
      (a === 198 && (b === 18 || b === 19)) || // benchmarking
      a >= 224 // multicast e reservado
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    // IPv4 mapeado (::ffff:a.b.c.d) vale como o IPv4
    const mapeado = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeado) return ehEnderecoPrivado(mapeado[1]);
    return (
      x.startsWith("fc") || // unique local fc00::/7
      x.startsWith("fd") ||
      x.startsWith("fe8") || // link-local fe80::/10
      x.startsWith("fe9") ||
      x.startsWith("fea") ||
      x.startsWith("feb") ||
      x.startsWith("ff") // multicast
    );
  }
  return true; // não é IP válido: não passa
}

export type DestinoDeWebhook = { ok: true; url: URL } | { ok: false; motivo: string };

const HOSTS_PROIBIDOS = /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/i;

export async function validarDestinoDeWebhook(
  bruta: string,
  resolver: (host: string) => Promise<string[]> = async (h) =>
    (await lookup(h, { all: true })).map((r) => r.address),
): Promise<DestinoDeWebhook> {
  let url: URL;
  try {
    url = new URL(bruta);
  } catch {
    return { ok: false, motivo: "URL inválida" };
  }
  if (url.protocol !== "https:") return { ok: false, motivo: "a URL deve ser https" };
  if (url.username || url.password)
    return { ok: false, motivo: "a URL não pode ter usuário e senha" };

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    return ehEnderecoPrivado(host)
      ? { ok: false, motivo: "endereço interno não é permitido" }
      : { ok: true, url };
  }
  // Nome de serviço interno (docker/k8s): sem ponto, ou sufixo reservado.
  if (!host.includes(".") || HOSTS_PROIBIDOS.test(host)) {
    return { ok: false, motivo: "endereço interno não é permitido" };
  }

  let enderecos: string[];
  try {
    enderecos = await resolver(host);
  } catch {
    return { ok: false, motivo: "não consegui resolver o endereço" };
  }
  if (enderecos.length === 0) return { ok: false, motivo: "não consegui resolver o endereço" };
  // UM endereço interno basta para recusar: o `fetch` pode escolher qualquer.
  if (enderecos.some(ehEnderecoPrivado))
    return { ok: false, motivo: "endereço interno não é permitido" };
  return { ok: true, url };
}

/** Cabeçalhos que o cliente não pode definir: controlam o transporte, não o conteúdo. */
const CABECALHOS_PROIBIDOS = new Set([
  "host",
  "content-length",
  "content-type",
  "transfer-encoding",
  "connection",
  "upgrade",
  "te",
  "trailer",
  "expect",
  "keep-alive",
  "proxy-authorization",
  "proxy-authenticate",
]);

export function cabecalhoPermitido(nome: string): boolean {
  const n = nome.trim().toLowerCase();
  return /^[a-z0-9-]{1,64}$/.test(n) && !CABECALHOS_PROIBIDOS.has(n);
}
