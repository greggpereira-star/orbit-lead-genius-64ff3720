/**
 * Situação do número NA META, para a tela não dizer "Ativo" de um número que a Meta ainda
 * não liberou. "Ativo" no Leadflow significa só "conectado aqui"; quem manda é a Meta.
 */
export type NivelDaSituacao = "ok" | "aviso" | "erro" | "desconhecido";

export interface SituacaoDoNumero {
  nivel: NivelDaSituacao;
  rotulo: string;
  /** O que fazer, quando há o que fazer. */
  dica: string | null;
}

export function situacaoDoNumeroNaMeta(status: string | null | undefined): SituacaoDoNumero {
  const s = (status ?? "").trim().toUpperCase();
  switch (s) {
    case "CONNECTED":
      return { nivel: "ok", rotulo: "Conectado na Meta", dica: null };
    case "PENDING":
    case "UNVERIFIED":
      return {
        nivel: "aviso",
        rotulo: "Pendente na Meta",
        dica: "A Meta ainda não concluiu o registro deste número: ele não envia nem recebe mensagens. Conclua a verificação do código e o registro no WhatsApp Manager.",
      };
    case "RESTRICTED":
    case "RATE_LIMITED":
    case "FLAGGED":
      return {
        nivel: "aviso",
        rotulo: s === "FLAGGED" ? "Sinalizado pela Meta" : "Restrito pela Meta",
        dica: "A Meta limitou este número. Veja o motivo no WhatsApp Manager antes de enviar mais mensagens.",
      };
    case "BANNED":
    case "DELETED":
    case "MIGRATED":
      return {
        nivel: "erro",
        rotulo:
          s === "MIGRATED" ? "Migrado" : s === "DELETED" ? "Removido na Meta" : "Banido pela Meta",
        dica: "Este número não pode mais enviar por esta conta.",
      };
    case "":
      return { nivel: "desconhecido", rotulo: "Status da Meta indisponível", dica: null };
    default:
      return { nivel: "desconhecido", rotulo: `Meta: ${s.toLowerCase()}`, dica: null };
  }
}
