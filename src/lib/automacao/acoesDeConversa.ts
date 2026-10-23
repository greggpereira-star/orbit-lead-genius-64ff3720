/**
 * Ações do motor sobre a CONVERSA do WhatsApp: resolver, reabrir e pedir avaliação do atendimento.
 * Ficam fora da rota do cron para terem teste.
 *
 * Todas precisam de `conversation_id` no evento. Eventos sem conversa (lead criado, formulário
 * abandonado…) devolvem "pulada" com o motivo: não é falha, a regra só não se aplica ali.
 */
import { TEXTO_PADRAO_DA_PESQUISA } from "../whatsapp/cloud/avaliacao";
import { acaoEnviarWhatsApp, type JobDeWhatsApp, type ResultadoSimples } from "./acoesDeWhatsApp";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

const conversaDoJob = (job: JobDeWhatsApp): string | null =>
  typeof job.payload?.conversation_id === "string" ? (job.payload.conversation_id as string) : null;

async function mudarStatus(
  admin: Db,
  job: JobDeWhatsApp,
  tipo: "resolver_conversa" | "reabrir_conversa",
  de: "resolved" | "open" | "pending",
  para: "resolved" | "open",
): Promise<ResultadoSimples> {
  const conversaId = conversaDoJob(job);
  if (!conversaId) return { acao: tipo, status: "pulada", detalhe: "sem conversa" };

  // Só muda quem está no estado esperado, escopado na empresa do JOB: a ação de uma regra nunca
  // mexe em conversa de outra empresa, e resolver o que já está resolvido não reescreve nada.
  const q = admin
    .from("wa_conversations")
    .update({ status: para })
    .eq("id", conversaId)
    .eq("company_id", job.company_id);
  const { data, error } = await (
    de === "resolved" ? q.eq("status", "resolved") : q.neq("status", "resolved")
  ).select("id");
  if (error) return { acao: tipo, status: "falhou", detalhe: error.message };
  if (!data || data.length === 0)
    return {
      acao: tipo,
      status: "pulada",
      detalhe: para === "resolved" ? "já estava resolvida" : "já estava aberta",
    };
  return { acao: tipo, status: "ok" };
}

export const acaoResolverConversa = (admin: Db, job: JobDeWhatsApp) =>
  mudarStatus(admin, job, "resolver_conversa", "open", "resolved");

export const acaoReabrirConversa = (admin: Db, job: JobDeWhatsApp) =>
  mudarStatus(admin, job, "reabrir_conversa", "resolved", "open");

/**
 * Pede a nota (texto simples; vale na janela de 24 h, que é onde a conversa costuma estar ao ser
 * resolvida) e marca a pesquisa como em aberto. A resposta "1" a "5" é gravada pelo processador de
 * mensagens recebidas. Quem pediu para parar não recebe: a política de envio já cuida disso.
 */
export async function acaoAvaliarAtendimento(
  admin: Db,
  job: JobDeWhatsApp,
  cfg: Record<string, any>,
): Promise<ResultadoSimples> {
  const tipo = "avaliar_atendimento";
  const conversaId = conversaDoJob(job);
  if (!conversaId) return { acao: tipo, status: "pulada", detalhe: "sem conversa" };

  const mensagem = String(cfg.mensagem ?? "").trim() || TEXTO_PADRAO_DA_PESQUISA;
  const envio = await acaoEnviarWhatsApp(admin, job, { mensagem }, "enviar_whatsapp");
  if (envio.status !== "ok") return { ...envio, acao: tipo };

  const { error } = await admin
    .from("wa_conversations")
    .update({ csat_requested_at: new Date().toISOString(), csat_score: null, csat_at: null })
    .eq("id", conversaId)
    .eq("company_id", job.company_id);
  if (error)
    return {
      acao: tipo,
      status: "falhou",
      detalhe: `pedido enviado, mas não consegui marcar a pesquisa: ${error.message}`,
    };
  return { acao: tipo, status: "ok" };
}
