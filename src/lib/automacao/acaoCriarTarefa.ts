/**
 * Ação "Criar tarefa": grava uma anotação COM prazo (`lead_notes.scheduled_for`) no lead do evento.
 * O aviso de atribuição e o de vencimento são do banco (gatilho e `avisar_tarefas_vencidas`).
 *
 * Responsável: o da conversa; senão o do lead; ou uma pessoa fixa da regra. Sem ninguém válido a
 * tarefa nasce sem responsável e o aviso de prazo vai para quem... ninguém (não há autor): por isso,
 * sem responsável resolvido a ação fica "pulada" com o motivo, em vez de criar tarefa que nunca
 * avisa ninguém.
 */
import { preencher, type JobDeWhatsApp, type ResultadoSimples } from "./acoesDeWhatsApp";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

export const PRAZO_MIN_HORAS = 1;
export const PRAZO_MAX_HORAS = 24 * 30;
export const PRAZO_PADRAO_HORAS = 24;

export function prazoEmHoras(valor: unknown): number {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < PRAZO_MIN_HORAS) return PRAZO_PADRAO_HORAS;
  return Math.min(Math.floor(n), PRAZO_MAX_HORAS);
}

export async function acaoCriarTarefa(
  admin: Db,
  job: JobDeWhatsApp,
  cfg: Record<string, any>,
  agora: Date = new Date(),
): Promise<ResultadoSimples> {
  const tipo = "criar_tarefa";
  if (!job.lead_id) return { acao: tipo, status: "pulada", detalhe: "sem lead" };

  const payload = job.payload ?? {};
  // Sem texto na regra: "Retomar o contato com Ana"; sem nome no evento, "Retomar o contato" (não
  // "Retomar o contato com").
  const padrao = payload.nome ? "Retomar o contato com {{nome}}" : "Retomar o contato";
  const texto = preencher(String(cfg.texto ?? "").trim() || padrao, payload)
    .trim()
    .slice(0, 500);
  if (!texto) return { acao: tipo, status: "pulada", detalhe: "tarefa sem texto" };

  // Quem faz: pessoa fixa da regra, senão o responsável da conversa, senão o do lead.
  let userId: string | null =
    cfg.destino === "usuario" && typeof cfg.user_id === "string" && cfg.user_id
      ? cfg.user_id
      : null;
  if (!userId && typeof payload.responsavel_id === "string") userId = payload.responsavel_id;
  if (!userId) {
    const { data: lead } = await admin
      .from("leads")
      .select("assigned_to")
      .eq("id", job.lead_id)
      .eq("company_id", job.company_id)
      .maybeSingle();
    userId = (lead?.assigned_to as string | null) ?? null;
  }
  if (!userId) return { acao: tipo, status: "pulada", detalhe: "nenhum responsável resolvido" };

  const { data: membro } = await admin
    .from("memberships")
    .select("user_id")
    .eq("company_id", job.company_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membro) return { acao: tipo, status: "falhou", detalhe: "responsável não é da empresa" };

  // O lead precisa ser DESTA empresa: o job traz o id, e a tarefa é gravada com a empresa do job.
  const { data: lead } = await admin
    .from("leads")
    .select("id")
    .eq("id", job.lead_id)
    .eq("company_id", job.company_id)
    .maybeSingle();
  if (!lead) return { acao: tipo, status: "falhou", detalhe: "lead não é desta empresa" };

  const horas = prazoEmHoras(cfg.prazo_horas);
  const { error } = await admin.from("lead_notes").insert({
    company_id: job.company_id,
    lead_id: job.lead_id,
    author_id: null,
    author_name: "Automação",
    body: texto,
    scheduled_for: new Date(agora.getTime() + horas * 3_600_000).toISOString(),
    assigned_to: userId,
  });
  if (error) return { acao: tipo, status: "falhou", detalhe: error.message };
  return { acao: tipo, status: "ok", detalhe: `prazo em ${horas} h` };
}
