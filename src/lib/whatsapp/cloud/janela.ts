/**
 * Janela de atendimento de 24 h da Cloud API.
 *
 * Abre com a última mensagem DO CLIENTE e dura 24 h. Dentro dela, qualquer tipo
 * de mensagem; fora, só template aprovado (erro 131047 quando se tenta o
 * contrário). Eco do app e mensagem do próprio negócio NÃO abrem a janela.
 */
export const JANELA_MS = 24 * 60 * 60 * 1000;

export interface EstadoDaJanela {
  aberta: boolean;
  /** Quando fecha, se estiver aberta. */
  fechaEm: Date | null;
  /** Milissegundos restantes (0 se fechada). */
  restanteMs: number;
}

export function estadoDaJanela(
  ultimaMensagemDoCliente: string | Date | null | undefined,
  agora: Date = new Date(),
): EstadoDaJanela {
  if (!ultimaMensagemDoCliente) return { aberta: false, fechaEm: null, restanteMs: 0 };
  const t = new Date(ultimaMensagemDoCliente).getTime();
  if (!Number.isFinite(t)) return { aberta: false, fechaEm: null, restanteMs: 0 };
  const fecha = t + JANELA_MS;
  const restante = fecha - agora.getTime();
  return restante > 0
    ? { aberta: true, fechaEm: new Date(fecha), restanteMs: restante }
    : { aberta: false, fechaEm: null, restanteMs: 0 };
}

/** "3h12" / "47 min" para o banner da conversa. */
export function rotuloDaJanela(restanteMs: number): string {
  if (restanteMs <= 0) return "fechada";
  const min = Math.floor(restanteMs / 60000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
