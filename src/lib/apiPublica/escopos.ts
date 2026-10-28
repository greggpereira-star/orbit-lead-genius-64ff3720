/**
 * O que uma chave de API pode fazer. Sem Node: a tela importa daqui.
 *
 * `leads:write` NÃO inclui a leitura de propósito — quem integra só para enviar
 * leads (formulário externo, importador) não precisa ler a base inteira. Marcar
 * os dois é uma escolha explícita.
 */
export const ESCOPOS = ["leads:read", "leads:write"] as const;
export type Escopo = (typeof ESCOPOS)[number];

export const ROTULO_DO_ESCOPO: Record<Escopo, string> = {
  "leads:read": "Ler leads e etapas",
  "leads:write": "Criar e atualizar leads",
};

/** Eventos que um webhook pode assinar. Têm de bater com o CHECK da migration. */
export const EVENTOS_DE_WEBHOOK = ["lead.created", "lead.stage_changed"] as const;
export type EventoDeWebhook = (typeof EVENTOS_DE_WEBHOOK)[number];

export const ROTULO_DO_EVENTO: Record<EventoDeWebhook, string> = {
  "lead.created": "Lead criado",
  "lead.stage_changed": "Lead mudou de etapa",
};

/** Lista de escopos recebida de fora → lista validada e sem repetição, ou `null`. */
export function escoposValidos(bruto: unknown): Escopo[] | null {
  if (!Array.isArray(bruto) || bruto.length === 0) return null;
  const vistos = new Set<Escopo>();
  for (const e of bruto) {
    if (!(ESCOPOS as readonly unknown[]).includes(e)) return null;
    vistos.add(e as Escopo);
  }
  return [...vistos];
}

export function permite(escopos: readonly string[], necessario: Escopo): boolean {
  return escopos.includes(necessario);
}
