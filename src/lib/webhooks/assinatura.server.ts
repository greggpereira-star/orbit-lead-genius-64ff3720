import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Assinatura dos webhooks de saída.
 *
 * Cabeçalho: `X-Leadflow-Signature: t=<segundos>,v1=<hex>`, onde
 * `v1 = HMAC-SHA256(segredo, "<t>.<corpo>")`.
 *
 * O timestamp entra na conta de propósito: sem ele, quem capturasse uma entrega
 * válida a reenviaria para sempre. O destinatário recusa `t` fora da tolerância.
 * O corpo assinado é EXATAMENTE o texto enviado — quem verifica deve usar o corpo
 * cru, antes de qualquer parse de JSON.
 */
export const TOLERANCIA_EM_SEGUNDOS = 300;

export function gerarSegredoDeWebhook(): string {
  return "whsec_" + randomBytes(32).toString("base64url");
}

export function assinar(segredo: string, timestamp: number, corpo: string): string {
  return createHmac("sha256", segredo).update(`${timestamp}.${corpo}`, "utf8").digest("hex");
}

export function cabecalhoDeAssinatura(segredo: string, timestamp: number, corpo: string): string {
  return `t=${timestamp},v1=${assinar(segredo, timestamp, corpo)}`;
}

/** Lado do destinatário (e do nosso teste): confere assinatura e frescor. */
export function verificarAssinatura(
  cabecalho: string | null | undefined,
  segredo: string,
  corpo: string,
  agoraEmSegundos: number,
  tolerancia = TOLERANCIA_EM_SEGUNDOS,
): boolean {
  if (!cabecalho || !segredo) return false;
  const partes = Object.fromEntries(
    cabecalho.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(partes.t);
  if (!Number.isInteger(t) || !partes.v1) return false;
  if (Math.abs(agoraEmSegundos - t) > tolerancia) return false;
  const esperado = Buffer.from(assinar(segredo, t, corpo), "utf8");
  const recebido = Buffer.from(partes.v1, "utf8");
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

/**
 * Espera antes da próxima tentativa, em segundos, depois de `tentativasFeitas`
 * falhas. `null` = esgotou. Seis tentativas ao todo (a primeira é imediata).
 */
export const ESPERAS_EM_SEGUNDOS = [60, 300, 1800, 7200, 21600] as const;
export const MAX_TENTATIVAS = ESPERAS_EM_SEGUNDOS.length + 1;

export function proximaEspera(tentativasFeitas: number): number | null {
  if (tentativasFeitas < 1 || tentativasFeitas >= MAX_TENTATIVAS) return null;
  return ESPERAS_EM_SEGUNDOS[tentativasFeitas - 1];
}

/** Entregas esgotadas em sequência que desligam o endpoint. */
export const FALHAS_PARA_DESLIGAR = 8;
