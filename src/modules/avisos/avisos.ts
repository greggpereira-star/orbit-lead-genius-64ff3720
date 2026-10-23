/**
 * Avisos da equipe (`team_notifications`): o que o sino do topo mostra. As regras de contagem,
 * de destino do clique e do rótulo de tempo ficam aqui, puras, para ter teste.
 */
export interface Aviso {
  id: string;
  title: string;
  body: string | null;
  conversation_id: string | null;
  lead_id: string | null;
  created_at: string;
  read_at: string | null;
}

export const naoLidos = (avisos: Aviso[]): number => avisos.filter((a) => !a.read_at).length;

/** O sino mostra "9+" a partir de dez: o número exato deixa de importar. */
export function rotuloDaContagem(n: number): string | null {
  if (n <= 0) return null;
  return n > 9 ? "9+" : String(n);
}

export type DestinoDoAviso =
  { tipo: "conversa"; id: string } | { tipo: "lead"; id: string } | { tipo: "nenhum" };

/** A conversa vem primeiro (é onde se age); sem ela, a ficha do lead. */
export function destinoDoAviso(a: Pick<Aviso, "conversation_id" | "lead_id">): DestinoDoAviso {
  if (a.conversation_id) return { tipo: "conversa", id: a.conversation_id };
  if (a.lead_id) return { tipo: "lead", id: a.lead_id };
  return { tipo: "nenhum" };
}

/** "agora", "5 min", "3 h", "2 d" — curto, porque cabe numa linha do painel. */
export function tempoDecorrido(iso: string, agora: Date = new Date()): string {
  const min = Math.max(0, Math.floor((agora.getTime() - Date.parse(iso)) / 60_000));
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} d`;
}
