/**
 * Tarefas por lead: anotação COM data (`lead_notes.scheduled_for`) é tarefa; `done` marca feita.
 * Regras puras da tela: prazos rápidos, rótulo do prazo e ordem da lista.
 */
import { duracaoCurta } from "../../../lib/duracao";

export interface Tarefa {
  id: string;
  lead_id: string;
  body: string;
  scheduled_for: string | null;
  done: boolean;
  assigned_to?: string | null;
  author_id?: string | null;
  done_at?: string | null;
}

/** Só anotação com data é tarefa; anotação sem data fica no histórico, não na lista de tarefas. */
export const ehTarefa = (n: { scheduled_for: string | null }): boolean => Boolean(n.scheduled_for);

export interface PrazoRapido {
  id: string;
  rotulo: string;
  quando: Date;
}

/** `dia` em hora local às `hora`:00. */
function aoMeioDoDia(base: Date, somarDias: number, hora: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + somarDias);
  d.setHours(hora, 0, 0, 0);
  return d;
}

/**
 * Atalhos de prazo. "Hoje, 18h" só aparece se ainda não passou (senão seria uma tarefa que nasce
 * atrasada); hora redonda e comercial para o aviso chegar quando a pessoa está trabalhando.
 */
export function prazosRapidos(agora: Date = new Date()): PrazoRapido[] {
  const lista: PrazoRapido[] = [];
  const hoje18 = aoMeioDoDia(agora, 0, 18);
  if (hoje18.getTime() > agora.getTime() + 15 * 60_000)
    lista.push({ id: "hoje", rotulo: "Hoje, 18h", quando: hoje18 });
  lista.push({ id: "amanha", rotulo: "Amanhã, 9h", quando: aoMeioDoDia(agora, 1, 9) });
  lista.push({ id: "3dias", rotulo: "Em 3 dias", quando: aoMeioDoDia(agora, 3, 9) });
  lista.push({ id: "semana", rotulo: "Em 1 semana", quando: aoMeioDoDia(agora, 7, 9) });
  return lista;
}

export type SituacaoDoPrazo = "atrasada" | "hoje" | "futura" | "sem_prazo" | "feita";

const DM_HM = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * "em 2 h 10 min", "há 45 min" até 24 h de distância; além disso a data ("25/10 09:00"). Nunca
 * "1246 min": horas e minutos, ou a data.
 */
export function rotuloDoPrazo(
  t: Pick<Tarefa, "scheduled_for" | "done">,
  agora: Date = new Date(),
): { texto: string; situacao: SituacaoDoPrazo } {
  if (t.done) return { texto: "feita", situacao: "feita" };
  if (!t.scheduled_for) return { texto: "sem prazo", situacao: "sem_prazo" };
  const alvo = new Date(t.scheduled_for);
  const min = Math.round((alvo.getTime() - agora.getTime()) / 60_000);
  const atrasada = min < 0;
  const dentroDe24h = Math.abs(min) < 24 * 60;
  const texto = dentroDe24h
    ? atrasada
      ? `há ${duracaoCurta(-min)}`
      : `em ${duracaoCurta(min)}`
    : DM_HM.format(alvo).replace(",", "");
  const mesmoDia = alvo.toDateString() === agora.toDateString();
  return { texto, situacao: atrasada ? "atrasada" : mesmoDia ? "hoje" : "futura" };
}

/** Abertas primeiro (mais atrasadas no topo); feitas por último, as mais recentes antes. */
export function ordenarTarefas<T extends Pick<Tarefa, "scheduled_for" | "done" | "done_at">>(
  lista: readonly T[],
): T[] {
  return [...lista].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.done && b.done) return (b.done_at ?? "").localeCompare(a.done_at ?? "");
    return (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? "");
  });
}

export function contarAbertas(
  lista: readonly Pick<Tarefa, "done" | "scheduled_for">[],
  agora: Date = new Date(),
): {
  abertas: number;
  atrasadas: number;
} {
  const abertas = lista.filter((t) => ehTarefa(t) && !t.done);
  return {
    abertas: abertas.length,
    atrasadas: abertas.filter((t) => Date.parse(t.scheduled_for as string) < agora.getTime())
      .length,
  };
}

/** Para a tela "Tarefas": o que atrasou, o que é de hoje e o que vem depois (abertas, por prazo). */
export function agruparPorSituacao<T extends Pick<Tarefa, "scheduled_for" | "done" | "done_at">>(
  lista: readonly T[],
  agora: Date = new Date(),
): { atrasadas: T[]; hoje: T[]; proximas: T[] } {
  const abertas = ordenarTarefas(lista.filter((t) => ehTarefa(t) && !t.done));
  const grupos = { atrasadas: [] as T[], hoje: [] as T[], proximas: [] as T[] };
  for (const t of abertas) {
    const { situacao } = rotuloDoPrazo(t, agora);
    if (situacao === "atrasada") grupos.atrasadas.push(t);
    else if (situacao === "hoje") grupos.hoje.push(t);
    else grupos.proximas.push(t);
  }
  return grupos;
}
