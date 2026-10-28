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
  /** Quando o registro foi feito: fixado pelo servidor. */
  created_at: string;
  /** Quando o contato aconteceu: o do clique, ou o que a pessoa informou. */
  contatado_em: string;
}

/** Diferença a partir da qual o horário vale como "informado à mão" (mesma régua do banco). */
export const TOLERANCIA_RETROATIVO_MS = 5 * 60 * 1000;

export const rotuloDoCanal = (canal: string): string =>
  CANAIS_DE_CONTATO.find((c) => c.valor === canal)?.rotulo ?? "Outro";

/** Valor de <input type="datetime-local"> no fuso do navegador: "2026-10-28T09:30". */
export function paraCampoLocal(d: Date): string {
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** Mesmas regras do banco, para avisar antes de enviar. `null` = pode enviar. */
export function validarHorario(
  quando: Date | null,
  criadoEm: Date | null,
  agora: Date = new Date(),
): string | null {
  if (!quando || Number.isNaN(quando.getTime())) return "Informe a data e a hora do contato.";
  if (quando.getTime() > agora.getTime() + 60_000) return "O horário não pode estar no futuro.";
  if (criadoEm && quando.getTime() < criadoEm.getTime()) {
    return "O horário é anterior à chegada do lead.";
  }
  return null;
}

function registradoHa(createdAt: string, agora: number): string {
  const segundos = Math.max(0, (agora - new Date(createdAt).getTime()) / 1000);
  return segundos < 60 ? "agora há pouco" : `há ${formatarDuracao(segundos)}`;
}

/**
 * "WhatsApp · há 2 h · Dora". Quando o horário foi informado à mão, diz também há quanto tempo
 * foi registrado: o indicador de atendimento usa o horário informado, e quem lê precisa ver a diferença.
 */
export function descreverUltimoContato(c: ContatoRegistrado, agora: number = Date.now()): string {
  const desde = Math.max(0, (agora - new Date(c.contatado_em).getTime()) / 1000);
  const quando = desde < 60 ? "agora há pouco" : `há ${formatarDuracao(desde)}`;
  const atraso = new Date(c.created_at).getTime() - new Date(c.contatado_em).getTime();
  const nota =
    atraso > TOLERANCIA_RETROATIVO_MS
      ? `horário informado, registrado ${registradoHa(c.created_at, agora)}`
      : null;
  return [rotuloDoCanal(c.canal), quando, c.author_name, nota].filter(Boolean).join(" · ");
}
