/**
 * Regras da lista de conversas do atendimento. Puras: a tela só desenha o que
 * estas funções decidem, e é por isso que dá para testá-las.
 */
import { estadoDaJanela, type EstadoDaJanela } from "../../../lib/whatsapp/cloud/janela";

export type StatusDaConversa = "open" | "pending" | "resolved";
/** "entrada" = tudo que ainda está em aberto (a visão padrão do inbox). */
export type Filtro =
  "entrada" | "minhas" | "seguindo" | "mencoes" | "fila" | "todas" | "resolvidas";

/** Conjuntos pessoais (vêm de tabelas próprias): conversas seguidas e com menção não lida. */
export interface ConjuntosPessoais {
  seguindo?: ReadonlySet<string>;
  mencoes?: ReadonlySet<string>;
}

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
  /** Nota de 1 a 5 que o cliente deu ao atendimento (pesquisa por WhatsApp); `null` se não houve. */
  csat_score?: number | null;
  contact: { wa_id: string; profile_name: string | null; opted_out_at: string | null } | null;
  lead: {
    id: string;
    name: string | null;
    email: string | null;
    /** Etapa e etiquetas do lead: aparecem na linha e servem de filtro. */
    stage_id?: string | null;
    stage?: { name: string; color: string | null; kind?: string | null } | null;
    tags?: Array<{ tag_name: string }> | null;
  } | null;
  /** Número da conversa: só o que o atendimento precisa saber dele. */
  numero?: { receive_only: boolean } | null;
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

/**
 * O nome de VERDADE do contato (lead ou perfil do WhatsApp), ou `null` se só há o número.
 * Serve para sugerir "Olá, {nome}" num template: sugerir o telefone como se fosse nome
 * mandaria "Oi +55 (27) 91111-0111!" ao cliente.
 */
export function nomeProprioDoContato(c: Pick<ConversaDaLista, "lead" | "contact">): string | null {
  return c.lead?.name?.trim() || c.contact?.profile_name?.trim() || null;
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

/**
 * O WhatsApp Cloud API não entrega foto de perfil (só nome e número), então o avatar
 * é a inicial com uma cor FIXA por contato: a mesma pessoa tem sempre a mesma cor.
 * As classes são literais para o Tailwind enxergá-las.
 */
const CORES_DO_AVATAR = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300",
  "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300",
] as const;

export function corDoAvatar(chave: string): string {
  let h = 0;
  for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0;
  return CORES_DO_AVATAR[h % CORES_DO_AVATAR.length];
}

/** Iniciais do nome DE VERDADE; `null` quando só há o número (o avatar mostra um ícone). */
export function iniciaisDaConversa(c: Pick<ConversaDaLista, "lead" | "contact">): string | null {
  const nome = nomeProprioDoContato(c);
  return nome ? iniciais(nome) : null;
}

const naoResolvida = (c: ConversaDaLista) => c.status !== "resolved";

/** "Minhas" = comigo e em aberto. "Fila" = ninguém pegou ainda. */
export function filtrarConversas(
  lista: ConversaDaLista[],
  p: {
    filtro: Filtro;
    userId: string | null;
    busca?: string;
    /** `espera`: quem espera há mais tempo primeiro. Padrão: mais recente primeiro. */
    ordem?: OrdemDaLista;
    agora?: Date;
    /** Só conversas cujo lead tem esta etiqueta (sem diferenciar maiúsculas). */
    etiqueta?: string | null;
    /** Só conversas cujo lead está nesta etapa. */
    etapaId?: string | null;
  } & ConjuntosPessoais,
): ConversaDaLista[] {
  const q = (p.busca ?? "").trim().toLowerCase();
  const digitos = q.replace(/\D/g, "");

  return lista
    .filter((c) => {
      switch (p.filtro) {
        case "entrada":
          return naoResolvida(c);
        case "minhas":
          return naoResolvida(c) && !!p.userId && c.assigned_to === p.userId;
        case "seguindo":
          return naoResolvida(c) && !!p.seguindo?.has(c.id);
        case "mencoes":
          return !!p.mencoes?.has(c.id);
        case "fila":
          return naoResolvida(c) && c.assigned_to === null;
        case "resolvidas":
          return c.status === "resolved";
        default:
          return true;
      }
    })
    .filter((c) => {
      if (!p.etiqueta) return true;
      const alvo = p.etiqueta.trim().toLowerCase();
      return (c.lead?.tags ?? []).some((t) => t.tag_name.trim().toLowerCase() === alvo);
    })
    .filter((c) => !p.etapaId || c.lead?.stage_id === p.etapaId)
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
      if (p.ordem === "espera") {
        // Quem espera resposta vem antes, do que espera há mais tempo ao mais recente.
        const ea = esperaDe(a, p.agora);
        const eb = esperaDe(b, p.agora);
        if (ea && eb) return eb.minutos - ea.minutos;
        if (ea) return -1;
        if (eb) return 1;
      }
      // Mais recente primeiro; sem mensagem vai para o fim.
      const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
      const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
      return tb - ta;
    });
}

/** Etiquetas que existem nas conversas carregadas, sem repetir (maiúsculas não importam). */
export function etiquetasDaLista(lista: ConversaDaLista[]): string[] {
  const vistas = new Map<string, string>();
  for (const c of lista)
    for (const t of c.lead?.tags ?? []) {
      const nome = t.tag_name.trim();
      if (nome && !vistas.has(nome.toLowerCase())) vistas.set(nome.toLowerCase(), nome);
    }
  return [...vistas.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Etapas que existem nas conversas carregadas (só o que dá resultado ao filtrar). */
export function etapasDaLista(
  lista: ConversaDaLista[],
): Array<{ id: string; nome: string; cor: string | null }> {
  const vistas = new Map<string, { id: string; nome: string; cor: string | null }>();
  for (const c of lista) {
    const id = c.lead?.stage_id;
    const nome = c.lead?.stage?.name;
    if (id && nome && !vistas.has(id))
      vistas.set(id, { id, nome, cor: c.lead?.stage?.color ?? null });
  }
  return [...vistas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export type OrdemDaLista = "recentes" | "espera";

export type NivelDeEspera = "ok" | "atencao" | "critico";

/**
 * Há quanto tempo o cliente espera resposta (só se espera de fato: ele escreveu por
 * último, a janela está aberta e a conversa não está resolvida). É a medida que
 * importa para a venda; a data da última mensagem não diz isso.
 */
export function esperaDe(
  c: ConversaDaLista,
  agora: Date = new Date(),
): { minutos: number; texto: string; nivel: NivelDeEspera } | null {
  if (!aguardandoResposta(c, agora) || !c.last_inbound_at) return null;
  const minutos = Math.max(
    0,
    Math.floor((agora.getTime() - Date.parse(c.last_inbound_at)) / 60_000),
  );
  const texto =
    minutos < 1 ? "agora" : minutos < 60 ? `${minutos} min` : `${Math.floor(minutos / 60)} h`;
  const nivel: NivelDeEspera = minutos < 15 ? "ok" : minutos < 60 ? "atencao" : "critico";
  return { minutos, texto, nivel };
}

export function contarPorFiltro(
  lista: ConversaDaLista[],
  userId: string | null,
  pessoais: ConjuntosPessoais = {},
): Record<Filtro, number> {
  const conta = (f: Filtro) => filtrarConversas(lista, { filtro: f, userId, ...pessoais }).length;
  return {
    entrada: conta("entrada"),
    minhas: conta("minhas"),
    seguindo: conta("seguindo"),
    mencoes: conta("mencoes"),
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
