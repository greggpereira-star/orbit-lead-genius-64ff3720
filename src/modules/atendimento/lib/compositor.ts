import type { EstadoDaJanela } from "../../../lib/whatsapp/cloud/janela";

/**
 * O que o atendente pode fazer na conversa agora.
 *
 *  - `texto`      janela aberta: escreve livremente.
 *  - `template`   janela fechada: só template aprovado (retomar a conversa).
 *  - `bloqueado`  o contato pediu para parar: nada vai.
 *  - `resolvida`  conversa resolvida: reabrir antes de responder.
 */
export type ModoDoCompositor = "texto" | "template" | "bloqueado" | "resolvida";

export function modoDoCompositor(p: {
  janela: EstadoDaJanela;
  optedOut: boolean;
  status: "open" | "pending" | "resolved";
}): ModoDoCompositor {
  // Opt-out vence tudo: nem template vai.
  if (p.optedOut) return "bloqueado";
  if (p.status === "resolved") return "resolvida";
  return p.janela.aberta ? "texto" : "template";
}

export const AVISO_DO_MODO: Record<ModoDoCompositor, string | null> = {
  texto: null,
  template: "A janela de 24h está fechada: para retomar a conversa envie um template aprovado.",
  bloqueado: "Este contato pediu para não receber mensagens.",
  resolvida: "Conversa resolvida. Reabra para responder.",
};
