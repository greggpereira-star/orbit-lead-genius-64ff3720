/**
 * "Conexão": o que a empresa conectou ao Leadflow para falar no WhatsApp, visto como UMA lista.
 *
 * Hoje há dois mundos: números da API oficial (`wa_phone_numbers`) e a conexão por QR code
 * (`whatsapp_instances`, uma por empresa). A tela de Conexões mostra os dois lado a lado, cada um
 * com TIPO e PROVEDOR (decisão de 22/10/2026: a oficial segue direto com a Meta; o campo
 * "provedor" existe para um dia caber outro, como um BSP, sem refazer a tela).
 */
import type { SaudeDaConexao } from "./saudeDoNumero";

export type TipoDeConexao = "oficial" | "qr";
export type EstadoDaConexao = "conectado" | "desconectado" | "pendente";

export interface Conexao {
  /** `phone_number_id` na oficial; "qr" na conexão por QR code (há uma por empresa). */
  id: string;
  tipo: TipoDeConexao;
  tipoRotulo: string;
  provedor: string;
  nome: string;
  telefone: string | null;
  /** Estado conhecido AQUI (sem a Meta): conectado ou desconectado. */
  estado: "conectado" | "desconectado";
  criadaEm: string | null;
  /** Só na oficial. */
  oficial: {
    phoneNumberId: string;
    wabaId: string | null;
    contaNome: string | null;
    modo: "coexistence" | "cloud_only";
    apenasReceptivo: boolean;
    webhookInscritoEm: string | null;
    motivoDaDesconexao: string | null;
  } | null;
  /** Só na QR code. */
  qr: { ultimaConexaoEm: string | null; ultimoErro: string | null } | null;
}

interface NumeroDb {
  phone_number_id: string;
  display_phone: string;
  mode: "coexistence" | "cloud_only";
  status: "active" | "disconnected";
  receive_only: boolean | null;
  webhook_subscribed_at: string | null;
  disconnection_reason: string | null;
  created_at: string | null;
  account?: { waba_id?: string | null; display_name?: string | null } | null;
}

interface InstanciaDb {
  id: string;
  status: string;
  phone_number: string | null;
  last_connected_at: string | null;
  last_error: string | null;
  created_at: string | null;
}

const soDigitos = (s: string) => s.replace(/\D/g, "");

/** 5527995329839 → +55 27 99532-9839. Fora do padrão BR volta com `+`. */
export function telefoneLegivel(bruto: string | null | undefined): string | null {
  const d = soDigitos(bruto ?? "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 13 || d.length === 12)) {
    const resto = d.slice(4);
    const corte = resto.length === 9 ? 5 : 4;
    return `+55 ${d.slice(2, 4)} ${resto.slice(0, corte)}-${resto.slice(corte)}`;
  }
  return `+${d}`;
}

export function montarConexoes(p: { numeros: NumeroDb[]; instancias: InstanciaDb[] }): Conexao[] {
  const oficiais: Conexao[] = p.numeros.map((n) => ({
    id: n.phone_number_id,
    tipo: "oficial",
    tipoRotulo: "WhatsApp Business API",
    provedor: "Meta (direto)",
    nome: n.account?.display_name?.trim() || `WhatsApp oficial ${telefoneLegivel(n.display_phone)}`,
    telefone: telefoneLegivel(n.display_phone),
    estado: n.status === "active" ? "conectado" : "desconectado",
    criadaEm: n.created_at,
    oficial: {
      phoneNumberId: n.phone_number_id,
      wabaId: n.account?.waba_id ?? null,
      contaNome: n.account?.display_name?.trim() || null,
      modo: n.mode,
      apenasReceptivo: Boolean(n.receive_only),
      webhookInscritoEm: n.webhook_subscribed_at,
      motivoDaDesconexao: n.disconnection_reason,
    },
    qr: null,
  }));

  const qrs: Conexao[] = p.instancias.map((i) => ({
    id: "qr",
    tipo: "qr",
    tipoRotulo: "WhatsApp (QR code)",
    provedor: "Evolution API",
    nome: "WhatsApp por QR code",
    telefone: telefoneLegivel(i.phone_number),
    estado: i.status === "connected" ? "conectado" : "desconectado",
    criadaEm: i.created_at,
    oficial: null,
    qr: { ultimaConexaoEm: i.last_connected_at, ultimoErro: i.last_error },
  }));

  return [...oficiais, ...qrs];
}

/**
 * Estado que a pessoa vê: o daqui, corrigido pela Meta. Um número "Ativo" no Leadflow mas
 * pendente na Meta não envia nem recebe, então vira "pendente".
 */
export function estadoEfetivo(
  c: Conexao,
  saude: SaudeDaConexao | null | undefined,
): EstadoDaConexao {
  if (c.estado === "desconectado") return "desconectado";
  if (saude && saude.status.rotulo === "Pendente na Meta") return "pendente";
  return "conectado";
}

/** A conexão pede atenção (limitada, bloqueada, pendente, restrita ou banida)? */
export function pedeAtencao(saude: SaudeDaConexao | null | undefined): boolean {
  if (!saude) return false;
  return (
    saude.envio.nivel === "limitado" ||
    saude.envio.nivel === "bloqueado" ||
    saude.status.nivel === "aviso" ||
    saude.status.nivel === "erro"
  );
}
