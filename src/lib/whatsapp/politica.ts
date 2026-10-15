/**
 * Política de envio — a mesma para QUALQUER caminho que fale com um lead.
 *
 * Existia só no caminho legado (`dispatchLeadWhatsApp`). A ação `enviar_whatsapp`
 * do motor de automação enviava para quem pediu para parar e fora do horário —
 * o gatilho clássico de denúncia, e na API oficial, de queda de qualidade do
 * número e infração de política. Centralizar aqui faz com que um caminho novo
 * não consiga "esquecer" a regra: ele passa por esta função ou não envia.
 */

import { variantesDoNumero } from "./numero";
import type { AdminDb, ConsultaDb } from "./provider";

export interface JanelaDeEnvio {
  inicio: number;
  fim: number;
}

/** Padrão do legado: 8h às 21h. */
export const JANELA_PADRAO: JanelaDeEnvio = { inicio: 8, fim: 21 };

/** Hora atual em São Paulo — o horário comercial que importa é o do lead. */
export function horaEmSaoPaulo(agora: Date = new Date()): number {
  const texto = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false,
  }).format(agora);
  return Number.parseInt(texto, 10);
}

/** `true` quando a hora cai dentro da janela (aceita janela que cruza a meia-noite). */
export function dentroDaJanela(hora: number, janela: JanelaDeEnvio): boolean {
  if (Number.isNaN(hora)) return true;
  const { inicio, fim } = janela;
  if (inicio === fim) return true;
  if (inicio < fim) return hora >= inicio && hora < fim;
  return hora >= inicio || hora < fim;
}

export type MotivoDeBloqueio = "opt_out" | "fora_do_horario" | "numero_invalido";

export type DecisaoDeEnvio =
  { enviar: true } | { enviar: false; motivo: MotivoDeBloqueio; texto: string };

const TEXTO: Record<MotivoDeBloqueio, string> = {
  opt_out: "Contato pediu para não receber mensagens",
  fora_do_horario: "Fora da janela",
  numero_invalido: "Telefone ausente ou inválido",
};

/**
 * Decide se uma mensagem pode ir. Pura: quem chama traz os fatos.
 *
 * A ORDEM é parte da regra. Número inválido vem primeiro (nada a avaliar);
 * opt-out antes de horário porque é a restrição que NUNCA passa — o horário só
 * adia, o opt-out cancela.
 */
export function decidirEnvio(fatos: {
  numero: string | null;
  optedOut: boolean;
  hora: number;
  janela: JanelaDeEnvio | null;
}): DecisaoDeEnvio {
  if (!fatos.numero)
    return { enviar: false, motivo: "numero_invalido", texto: TEXTO.numero_invalido };
  if (fatos.optedOut) return { enviar: false, motivo: "opt_out", texto: TEXTO.opt_out };
  if (fatos.janela && !dentroDaJanela(fatos.hora, fatos.janela)) {
    return {
      enviar: false,
      motivo: "fora_do_horario",
      texto: `${TEXTO.fora_do_horario} (${fatos.janela.inicio}h–${fatos.janela.fim}h)`,
    };
  }
  return { enviar: true };
}

/**
 * O número está na lista de opt-out? Confere as variações do nono dígito.
 *
 * Em caso de erro de consulta devolve `true` (bloqueia): não saber se a pessoa
 * pediu para parar não é licença para enviar.
 */
export async function numeroEmOptout(
  admin: AdminDb,
  companyId: string,
  numero: string,
): Promise<boolean> {
  const { data, error } = await (admin.from("whatsapp_optouts") as ConsultaDb)
    .select("phone")
    .eq("company_id", companyId)
    .in("phone", variantesDoNumero(numero))
    .limit(1);
  if (error) return true;
  return Array.isArray(data) && data.length > 0;
}

/** Janela configurada pela empresa; padrão quando não há configuração. */
export async function janelaDaEmpresa(admin: AdminDb, companyId: string): Promise<JanelaDeEnvio> {
  const { data } = await (admin.from("whatsapp_automation_settings") as ConsultaDb)
    .select("quiet_hours_start, quiet_hours_end")
    .eq("company_id", companyId)
    .maybeSingle();
  const linha = (data ?? {}) as { quiet_hours_start?: unknown; quiet_hours_end?: unknown };
  const inicio = Number(linha.quiet_hours_start);
  const fim = Number(linha.quiet_hours_end);
  if (Number.isFinite(inicio) && Number.isFinite(fim)) return { inicio, fim };
  return JANELA_PADRAO;
}
