import type { EstadoDaJanela } from "../../../lib/whatsapp/cloud/janela";

/**
 * O que o atendente pode fazer na conversa agora.
 *
 *  - `texto`      janela aberta: escreve livremente.
 *  - `template`   janela fechada: só template aprovado (retomar a conversa).
 *  - `bloqueado`  o contato pediu para parar: nada vai.
 *  - `resolvida`  conversa resolvida: reabrir antes de responder.
 *  - `somente_leitura`  papel que só lê (visualizador): acompanha, não responde.
 */
export type ModoDoCompositor =
  "texto" | "template" | "bloqueado" | "resolvida" | "somente_receptivo" | "somente_leitura";

export function modoDoCompositor(p: {
  janela: EstadoDaJanela;
  optedOut: boolean;
  status: "open" | "pending" | "resolved";
  /** Número apenas receptivo: fora da janela não há template para retomar. */
  apenasReceptivo?: boolean;
  /** Papel que só lê: o servidor já barra; a tela não deve oferecer o que vai falhar. */
  somenteLeitura?: boolean;
}): ModoDoCompositor {
  if (p.somenteLeitura) return "somente_leitura";
  // Opt-out vence tudo: nem template vai.
  if (p.optedOut) return "bloqueado";
  if (p.status === "resolved") return "resolvida";
  if (p.janela.aberta) return "texto";
  return p.apenasReceptivo ? "somente_receptivo" : "template";
}

export const AVISO_DO_MODO: Record<ModoDoCompositor, string | null> = {
  texto: null,
  template: "A janela de 24h está fechada: para retomar a conversa envie um template aprovado.",
  bloqueado: "Este contato pediu para não receber mensagens.",
  resolvida: "Conversa resolvida. Reabra para responder.",
  somente_leitura:
    "Seu acesso é somente leitura: você acompanha as conversas, mas não pode responder.",
  somente_receptivo:
    "Este número é apenas receptivo e a janela de 24h está fechada: só dá para responder quando o cliente escrever de novo.",
};
