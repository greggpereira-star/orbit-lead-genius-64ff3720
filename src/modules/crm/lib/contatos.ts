import { formatarDuracao } from "@/modules/analytics/lib/resposta";

export type CanalDeContato = "whatsapp" | "ligacao" | "email" | "presencial" | "outro";

export const CANAIS_DE_CONTATO: { valor: CanalDeContato; rotulo: string }[] = [
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "ligacao", rotulo: "Ligação" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "presencial", rotulo: "Presencial" },
  { valor: "outro", rotulo: "Outro" },
];

export interface ContatoRegistrado {
  id: string;
  canal: CanalDeContato;
  author_name: string | null;
  created_at: string;
}

export const rotuloDoCanal = (canal: string): string =>
  CANAIS_DE_CONTATO.find((c) => c.valor === canal)?.rotulo ?? "Outro";

/**
 * "WhatsApp · há 2 h · Dora". O horário é o do registro, não o do contato em si:
 * por isso o texto diz "registrado", e não "contatado".
 */
export function descreverUltimoContato(c: ContatoRegistrado, agora: number = Date.now()): string {
  const segundos = Math.max(0, (agora - new Date(c.created_at).getTime()) / 1000);
  const quando = segundos < 60 ? "agora há pouco" : `há ${formatarDuracao(segundos)}`;
  return [rotuloDoCanal(c.canal), quando, c.author_name].filter(Boolean).join(" · ");
}
