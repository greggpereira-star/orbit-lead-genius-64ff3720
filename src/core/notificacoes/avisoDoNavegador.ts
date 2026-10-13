/**
 * Aviso na área de trabalho: preferência e permissão.
 *
 * O aviso em si já existia — mensagem nova no Inbox toca um som e abre uma
 * notificação. O que não existia era CONTROLE: ele era sempre ligado, e a tela
 * de Configurações mostrava um interruptor que não gravava nada.
 *
 * A preferência vive no APARELHO, não na conta, e isso não é atalho: a
 * permissão do navegador é por navegador. Guardar no banco faria a pessoa
 * ligar no computador do trabalho e o produto afirmar, no celular, que o aviso
 * está ligado — quando o navegador de lá nunca foi perguntado.
 *
 * Aqui só mora decisão pura e leitura do navegador; quem desenha a tela
 * resolve o que fazer com cada estado.
 */

export const CHAVE_DO_AVISO = "altleadflow:aviso-navegador";

/** O que a pessoa escolheu neste aparelho. Padrão: ligado, como era antes. */
export function lerPreferencia(bruto: string | null | undefined): boolean {
  return bruto !== "0";
}

export function guardarPreferencia(ligado: boolean): void {
  try {
    localStorage.setItem(CHAVE_DO_AVISO, ligado ? "1" : "0");
  } catch {
    /* aba anônima ou armazenamento bloqueado: a escolha vale só nesta aba,
       que ainda é melhor do que recusar a troca */
  }
}

export type EstadoDoAviso =
  /** O navegador não tem notificação (ou estamos no servidor). */
  | "sem-suporte"
  /** O navegador bloqueou. Nem a preferência nem o código revertem isso. */
  | "bloqueado"
  /** Ainda não perguntamos. */
  | "a-perguntar"
  /** Pode avisar, e a pessoa quer. */
  | "ligado"
  /** Pode avisar, mas a pessoa desligou aqui. */
  | "desligado";

/**
 * O estado REAL, cruzando permissão com preferência.
 *
 * A permissão manda. Mostrar "ligado" quando o navegador bloqueou seria o
 * mesmo defeito que esta auditoria vem desfazendo: a tela afirmando o que não
 * acontece — e com um agravante, porque a pessoa pararia de procurar o
 * problema justamente por acreditar no interruptor.
 */
export function estadoDoAviso(
  permissao: NotificationPermission | null,
  querReceber: boolean,
): EstadoDoAviso {
  if (permissao === null) return "sem-suporte";
  if (permissao === "denied") return "bloqueado";
  if (permissao === "default") return "a-perguntar";
  return querReceber ? "ligado" : "desligado";
}

/** Se o aviso de fato sai. É o que o emissor consulta antes de notificar. */
export function podeAvisar(estado: EstadoDoAviso): boolean {
  return estado === "ligado";
}

export const EXPLICACAO: Record<EstadoDoAviso, string> = {
  "sem-suporte": "Este navegador não oferece avisos na área de trabalho.",
  bloqueado:
    "O navegador bloqueou os avisos deste site. Libere nas permissões do navegador — daqui não dá para reverter.",
  "a-perguntar": "Ao ligar, o navegador vai pedir sua permissão.",
  ligado: "Você recebe um aviso quando chega mensagem nova.",
  desligado: "Você não recebe aviso neste aparelho.",
};

/** A permissão atual, ou `null` quando o navegador não tem notificação. */
export function permissaoAtual(): NotificationPermission | null {
  if (typeof window === "undefined" || !("Notification" in window)) return null;
  return Notification.permission;
}
