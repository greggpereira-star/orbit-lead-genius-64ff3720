/**
 * Regras da lista de conversas do atendimento. Puras: a tela só desenha o que
 * estas funções decidem, e é por isso que dá para testá-las.
 */
import { estadoDaJanela, type EstadoDaJanela } from "../../../lib/whatsapp/cloud/janela";

export type StatusDaConversa = "open" | "pending" | "resolved";
export type Filtro = "minhas" | "fila" | "todas" | "resolvidas";

export interface ConversaDaLista {
  id: string;
  status: StatusDaConversa;
  assigned_to: string | null;
  department_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  unread_agent: number;
  lead_id: string | null;
  origin: Record<string, unknown> | null;
  contact: { wa_id: string; profile_name: string | null; opted_out_at: string | null } | null;
  lead: { id: string; name: string | null; email: string | null } | null;
}

/** 5527996318075 → +55 (27) 99631-8075. Fora do padrão BR devolve com `+`. */
export function formatarTelefone(waId: string): string {
  const d = waId.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 13 || d.length === 12)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    const corte = resto.length === 9 ? 5 : 4;
    return `+55 (${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
  }
  return d ? `+${d}` : "";
}

/** Quem é a pessoa na lista: nome do lead, depois o do perfil, depois o número. */
export function nomeDaConversa(c: Pick<ConversaDaLista, "lead" | "contact">): string {
  const lead = c.lead?.name?.trim();
  if (lead) return lead;
  const perfil = c.contact?.profile_name?.trim();
  if (perfil) return perfil;
  return c.contact ? formatarTelefone(c.contact.wa_id) : "Contato";
}

export function iniciais(nome: string): string {
  const partes = nome
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (partes.length === 0) return "?";
  const a = partes[0][0] ?? "";
  const b = partes.length > 1 ? (partes[partes.length - 1][0] ?? "") : "";
  return (a + b).toUpperCase();
}

const naoResolvida = (c: ConversaDaLista) => c.status !== "resolved";

/** "Minhas" = comigo e em aberto. "Fila" = ninguém pegou ainda. */
export function filtrarConversas(
  lista: ConversaDaLista[],
  p: { filtro: Filtro; userId: string | null; busca?: string },
): ConversaDaLista[] {
  const q = (p.busca ?? "").trim().toLowerCase();
  const digitos = q.replace(/\D/g, "");

  return lista
    .filter((c) => {
      switch (p.filtro) {
        case "minhas":
          return naoResolvida(c) && !!p.userId && c.assigned_to === p.userId;
        case "fila":
          return naoResolvida(c) && c.assigned_to === null;
        case "resolvidas":
          return c.status === "resolved";
        default:
          return true;
      }
    })
    .filter((c) => {
      if (!q) return true;
      const nome = nomeDaConversa(c).toLowerCase();
      const fone = c.contact?.wa_id ?? "";
      return (
        nome.includes(q) ||
        (c.last_message_preview ?? "").toLowerCase().includes(q) ||
        (digitos.length >= 3 && fone.includes(digitos))
      );
    })
    .sort((a, b) => {
      // Mais recente primeiro; sem mensagem vai para o fim.
      const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
      const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
      return tb - ta;
    });
}

export function contarPorFiltro(
  lista: ConversaDaLista[],
  userId: string | null,
): Record<Filtro, number> {
  const conta = (f: Filtro) => filtrarConversas(lista, { filtro: f, userId }).length;
  return {
    minhas: conta("minhas"),
    fila: conta("fila"),
    todas: lista.length,
    resolvidas: conta("resolvidas"),
  };
}

export function totalNaoLidas(lista: ConversaDaLista[]): number {
  return lista.filter(naoResolvida).reduce((s, c) => s + (c.unread_agent || 0), 0);
}

/**
 * O cliente escreveu por último e a janela ainda está aberta: há alguém
 * esperando resposta. Serve para destacar na lista.
 */
export function aguardandoResposta(c: ConversaDaLista, agora: Date = new Date()): boolean {
  return naoResolvida(c) && c.unread_agent > 0 && estadoDaJanela(c.last_inbound_at, agora).aberta;
}

export function janelaDaConversa(
  c: Pick<ConversaDaLista, "last_inbound_at">,
  agora?: Date,
): EstadoDaJanela {
  return estadoDaJanela(c.last_inbound_at, agora);
}
