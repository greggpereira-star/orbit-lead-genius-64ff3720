/**
 * Ação "Notificar equipe": grava um aviso por destinatário em `team_notifications`, que o sino do
 * topo mostra. Vive fora da rota do cron para ter teste.
 *
 * Quem recebe:
 *   - `usuario`     a pessoa escolhida (precisa ser membro da empresa);
 *   - `responsavel` quem está com a conversa; sem responsável, volta para `todos` — um aviso de
 *                   "cliente sem resposta" que não chega a ninguém é pior que um aviso para todos;
 *   - `todos`       quem atende (owner, admin, member). Visualizador não é avisado: não pode agir.
 */
import { preencher, type ResultadoSimples } from "./acoesDeWhatsApp";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (t: string) => any };

export interface JobDeAviso {
  id: string;
  company_id: string;
  lead_id: string | null;
  trigger_event: string;
  payload: Record<string, any> | null;
}

export const DESTINOS_DE_AVISO = ["responsavel", "todos", "usuario"] as const;
export type DestinoDeAviso = (typeof DESTINOS_DE_AVISO)[number];

/** Título e texto padrão por gatilho, quando a regra não escreve os seus. */
export function textoPadraoDoAviso(evento: string): { titulo: string; mensagem: string } {
  switch (evento) {
    case "customer_no_reply":
      return {
        titulo: "{{nome}} está sem resposta há {{minutos_esperando}} min",
        mensagem: "O cliente escreveu e ninguém respondeu ainda.",
      };
    case "window_expiring":
      return {
        titulo: "A janela de {{nome}} fecha em {{minutos_restantes}} min",
        mensagem: "Depois disso só dá para falar com ele por template aprovado.",
      };
    default:
      return { titulo: "Aviso da automação", mensagem: "" };
  }
}

export async function acaoNotificarEquipe(
  admin: Db,
  job: JobDeAviso,
  acao: { id?: string; config: Record<string, any> | null },
): Promise<ResultadoSimples> {
  const tipo = "notificar_equipe";
  const cfg = acao.config ?? {};
  const payload = job.payload ?? {};
  const destino: DestinoDeAviso = (DESTINOS_DE_AVISO as readonly string[]).includes(cfg.destino)
    ? cfg.destino
    : "responsavel";

  const padrao = textoPadraoDoAviso(job.trigger_event);
  const titulo = preencher(String(cfg.titulo ?? "").trim() || padrao.titulo, payload).trim();
  const mensagem = preencher(String(cfg.mensagem ?? "").trim() || padrao.mensagem, payload).trim();
  if (!titulo) return { acao: tipo, status: "pulada", detalhe: "aviso sem título" };

  const { data: equipe, error: erroEquipe } = await admin
    .from("memberships")
    .select("user_id, role")
    .eq("company_id", job.company_id);
  if (erroEquipe) return { acao: tipo, status: "falhou", detalhe: erroEquipe.message };
  const atendem = ((equipe ?? []) as Array<{ user_id: string; role: string }>).filter((m) =>
    ["owner", "admin", "member"].includes(m.role),
  );
  const doTime = new Set(((equipe ?? []) as Array<{ user_id: string }>).map((m) => m.user_id));

  let destinatarios: string[] = [];
  if (destino === "usuario") {
    const alvo = typeof cfg.user_id === "string" ? cfg.user_id : "";
    if (!alvo || !doTime.has(alvo))
      return { acao: tipo, status: "falhou", detalhe: "usuário não é desta empresa" };
    destinatarios = [alvo];
  } else if (destino === "responsavel") {
    let dono: string | null =
      typeof payload.responsavel_id === "string" ? payload.responsavel_id : null;
    if (!dono && job.lead_id) {
      const { data: lead } = await admin
        .from("leads")
        .select("assigned_to")
        .eq("id", job.lead_id)
        .eq("company_id", job.company_id)
        .maybeSingle();
      dono = (lead?.assigned_to as string | null) ?? null;
    }
    destinatarios = dono && doTime.has(dono) ? [dono] : atendem.map((m) => m.user_id);
  } else {
    destinatarios = atendem.map((m) => m.user_id);
  }

  destinatarios = [...new Set(destinatarios)];
  if (destinatarios.length === 0)
    return { acao: tipo, status: "pulada", detalhe: "ninguém para avisar" };

  const conversaId = typeof payload.conversation_id === "string" ? payload.conversation_id : null;
  const chave = `${job.id}:${acao.id ?? "acao"}`;
  const { error } = await admin.from("team_notifications").upsert(
    destinatarios.map((user_id) => ({
      company_id: job.company_id,
      user_id,
      conversation_id: conversaId,
      lead_id: job.lead_id,
      title: titulo,
      body: mensagem || null,
      dedup_key: chave,
    })),
    { onConflict: "user_id,dedup_key", ignoreDuplicates: true },
  );
  if (error) return { acao: tipo, status: "falhou", detalhe: error.message };
  return { acao: tipo, status: "ok", detalhe: `${destinatarios.length} pessoa(s)` };
}
