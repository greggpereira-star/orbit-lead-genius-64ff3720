/**
 * Despacho das mensagens agendadas.
 *
 * Reserva o lote no banco (atômico), envia cada uma pelo MESMO caminho do
 * atendente — `enviarTextoNaConversa`, que aplica opt-out e janela de 24h — e
 * grava o desfecho. Recusa de política é definitiva (não adianta tentar de
 * novo); só falha temporária do provedor volta à fila.
 */
import type { AdminDb, ConsultaDb } from "../provider";
import { enviarTextoNaConversa } from "./envio";
import type { DbWa } from "./processador";

export const MAX_TENTATIVAS_AGENDADA = 3;

interface Agendada {
  id: string;
  conversation_id: string;
  body: string;
  created_by: string | null;
  attempts: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabela = (db: DbWa, nome: string): any => (db as unknown as AdminDb).from(nome);
const rpc = (db: DbWa) =>
  (db as unknown as { rpc: (f: string, a?: Record<string, unknown>) => PromiseLike<any> }).rpc;

export async function despacharAgendadas(
  db: DbWa,
  opcoes: { limite?: number } = {},
): Promise<{ reservadas: number; enviadas: number; falhas: number; adiadas: number }> {
  const chamar = rpc(db).bind(db);
  await chamar("liberar_mensagens_agendadas_presas", { p_minutos: 10 });
  const { data, error } = await chamar("reservar_mensagens_agendadas", {
    p_limite: opcoes.limite ?? 25,
  });
  // Migração ainda não aplicada: sem fila, nada a fazer (não derruba o cron).
  if (error) return { reservadas: 0, enviadas: 0, falhas: 0, adiadas: 0 };

  const lote = (data ?? []) as Agendada[];
  const saldo = { reservadas: lote.length, enviadas: 0, falhas: 0, adiadas: 0 };

  for (const m of lote) {
    const agora = new Date().toISOString();
    let r: Awaited<ReturnType<typeof enviarTextoNaConversa>>;
    try {
      r = await enviarTextoNaConversa(db, {
        conversaId: m.conversation_id,
        texto: m.body,
        enviadoPor: m.created_by,
        origem: "agent",
      });
    } catch (e) {
      r = {
        ok: false,
        motivo: "provedor",
        texto: e instanceof Error ? e.message : "Falha ao enviar.",
        retentavel: true,
      };
    }

    if (r.ok) {
      await tabela(db, "wa_scheduled_messages")
        .update({ status: "sent", result: null, finished_at: agora })
        .eq("id", m.id);
      saldo.enviadas += 1;
      continue;
    }

    const temporaria = r.motivo === "provedor" && r.retentavel === true;
    const volta = temporaria && m.attempts < MAX_TENTATIVAS_AGENDADA;
    await tabela(db, "wa_scheduled_messages")
      .update({
        status: volta ? "pending" : "failed",
        result: r.texto.slice(0, 300),
        // Espera antes de tentar de novo, para não martelar o provedor.
        ...(volta
          ? { send_at: new Date(Date.now() + 5 * 60_000).toISOString() }
          : { finished_at: agora }),
      })
      .eq("id", m.id);
    if (volta) saldo.adiadas += 1;
    else saldo.falhas += 1;
  }
  return saldo;
}

/** Quanto tempo no futuro uma mensagem pode ser agendada. */
export const LIMITES_DO_AGENDAMENTO = {
  antecedenciaMinimaMs: 60_000,
  antecedenciaMaximaMs: 30 * 24 * 3600 * 1000,
  pendentesPorConversa: 10,
} as const;

/** Valida o horário pedido; devolve o ISO normalizado ou o motivo da recusa. */
export function validarHorario(
  entrada: string,
  agora: Date = new Date(),
): { ok: true; iso: string } | { ok: false; texto: string } {
  const t = Date.parse(entrada);
  if (!Number.isFinite(t)) return { ok: false, texto: "Horário inválido." };
  const delta = t - agora.getTime();
  if (delta < LIMITES_DO_AGENDAMENTO.antecedenciaMinimaMs)
    return { ok: false, texto: "Escolha um horário daqui a pelo menos 1 minuto." };
  if (delta > LIMITES_DO_AGENDAMENTO.antecedenciaMaximaMs)
    return { ok: false, texto: "O agendamento pode ir até 30 dias à frente." };
  return { ok: true, iso: new Date(t).toISOString() };
}

export type { ConsultaDb };
