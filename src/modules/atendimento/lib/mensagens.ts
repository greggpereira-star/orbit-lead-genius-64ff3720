/** Apresentação das mensagens da conversa. Puras e testáveis. */

export type StatusDaMensagem = "queued" | "sent" | "delivered" | "read" | "failed" | "received";

export interface MensagemDaConversa {
  id: string;
  direction: "inbound" | "outbound";
  origin: "customer" | "agent" | "automation" | "app_echo" | "history";
  type: string;
  body: string | null;
  status: StatusDaMensagem;
  provider_ts: string | null;
  created_at: string;
  template_name: string | null;
  sent_by: string | null;
  error_title: string | null;
  media_id: string | null;
}

export interface MarcaDeEntrega {
  /** Símbolo curto; a tela escolhe o ícone. */
  tipo: "relogio" | "enviada" | "entregue" | "lida" | "falha" | "nenhuma";
  rotulo: string;
}

/** Só saída tem marca de entrega; o que o cliente mandou não tem. */
export function marcaDeEntrega(
  m: Pick<MensagemDaConversa, "direction" | "status">,
): MarcaDeEntrega {
  if (m.direction === "inbound") return { tipo: "nenhuma", rotulo: "" };
  switch (m.status) {
    case "queued":
      return { tipo: "relogio", rotulo: "Enviando" };
    case "sent":
      return { tipo: "enviada", rotulo: "Enviada" };
    case "delivered":
      return { tipo: "entregue", rotulo: "Entregue" };
    case "read":
      return { tipo: "lida", rotulo: "Lida" };
    case "failed":
      return { tipo: "falha", rotulo: "Falhou" };
    default:
      return { tipo: "enviada", rotulo: "Enviada" };
  }
}

const ROTULO_DO_TIPO: Record<string, string> = {
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  document: "Documento",
  sticker: "Figurinha",
  location: "Localização",
  contacts: "Contato",
  reaction: "Reação",
  template: "Template",
  interactive: "Resposta",
  button: "Resposta",
};

/** O que mostrar quando a mensagem não é só texto (ou o texto veio vazio). */
export function textoParaExibir(
  m: Pick<MensagemDaConversa, "type" | "body" | "template_name">,
): string {
  const corpo = m.body?.trim();
  if (m.type === "template") {
    return corpo ? corpo : `[Template ${m.template_name ?? ""}]`.replace(" ]", "]");
  }
  if (corpo)
    return m.type === "text" || m.type === "reaction"
      ? corpo
      : `[${ROTULO_DO_TIPO[m.type] ?? m.type}] ${corpo}`;
  return `[${ROTULO_DO_TIPO[m.type] ?? "Mensagem"}]`;
}

/** Quem enviou, para a legenda da bolha de saída. */
export function autoriaDaSaida(origin: MensagemDaConversa["origin"]): string {
  switch (origin) {
    case "automation":
      return "Automação";
    case "app_echo":
      return "Pelo celular";
    case "agent":
      return "Equipe";
    default:
      return "";
  }
}

/** Instante usado para ordenar e agrupar: o do provedor, quando existe. */
export function instanteDaMensagem(
  m: Pick<MensagemDaConversa, "provider_ts" | "created_at">,
): number {
  const t = Date.parse(m.provider_ts ?? m.created_at);
  return Number.isFinite(t) ? t : 0;
}

const DIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const chaveDoDia = (t: number) => DIA.format(new Date(t));

/** Agrupa por dia (fuso de São Paulo) com rótulo Hoje / Ontem / data. */
export function agruparPorDia(
  mensagens: MensagemDaConversa[],
  agora: Date = new Date(),
): Array<{ chave: string; rotulo: string; mensagens: MensagemDaConversa[] }> {
  const ordenadas = [...mensagens].sort(
    (a, b) => instanteDaMensagem(a) - instanteDaMensagem(b) || a.id.localeCompare(b.id),
  );
  const hoje = chaveDoDia(agora.getTime());
  const ontem = chaveDoDia(agora.getTime() - 24 * 3600 * 1000);

  const grupos: Array<{ chave: string; rotulo: string; mensagens: MensagemDaConversa[] }> = [];
  for (const m of ordenadas) {
    const chave = chaveDoDia(instanteDaMensagem(m));
    let g = grupos[grupos.length - 1];
    if (!g || g.chave !== chave) {
      g = {
        chave,
        rotulo: chave === hoje ? "Hoje" : chave === ontem ? "Ontem" : chave,
        mensagens: [],
      };
      grupos.push(g);
    }
    g.mensagens.push(m);
  }
  return grupos;
}

const TIPOS_DE_MIDIA = new Set(["image", "audio", "video", "document", "sticker"]);

/** Mídia para exibir: tipo de mídia E arquivo ligado à mensagem. */
export function temMidia(m: Pick<MensagemDaConversa, "type" | "media_id">): boolean {
  return TIPOS_DE_MIDIA.has(m.type) && Boolean(m.media_id);
}
