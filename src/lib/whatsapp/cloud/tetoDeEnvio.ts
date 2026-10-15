/**
 * Teto de envio AUTOMÁTICO (regras, faixa do quiz) — não vale para o atendente.
 *
 * O telefone chega de formulário público: quem o preenche não prova que é o
 * dono. Sem teto, um script cria leads com o número de uma vítima (ou escreve
 * 500 vezes ao número da empresa) e a empresa envia — e paga — o volume, até a
 * Meta derrubar o número por denúncia. O teto não impede o primeiro contato
 * legítimo; impede a repetição.
 *
 *   por conversa / 24 h   → quantas mensagens automáticas UM contato recebe
 *   por empresa / hora    → quanto o número da empresa dispara sozinho
 */
import type { AdminDb, ConsultaDb } from "../provider";

export interface Tetos {
  porConversaPorDia: number;
  porEmpresaPorHora: number;
}

export function tetosDoAmbiente(env: Record<string, string | undefined> = process.env): Tetos {
  const n = (v: string | undefined, padrao: number) => {
    const x = Number(v);
    return Number.isInteger(x) && x > 0 ? x : padrao;
  };
  return {
    porConversaPorDia: n(env.WA_TETO_AUTOMACAO_DIA, 5),
    porEmpresaPorHora: n(env.WA_TETO_AUTOMACAO_HORA, 300),
  };
}

export type DecisaoDeTeto = { ok: true } | { ok: false; texto: string };

export function decidirTeto(
  c: { naConversaHoje: number; naEmpresaNaHora: number },
  t: Tetos,
): DecisaoDeTeto {
  if (c.naConversaHoje >= t.porConversaPorDia) {
    return {
      ok: false,
      texto: `Limite de ${t.porConversaPorDia} mensagens automáticas por contato em 24h atingido`,
    };
  }
  if (c.naEmpresaNaHora >= t.porEmpresaPorHora) {
    return {
      ok: false,
      texto: `Limite de ${t.porEmpresaPorHora} mensagens automáticas por hora atingido`,
    };
  }
  return { ok: true };
}

/** Conta do banco (mensagens de saída de origem `automation`). */
export async function checarTetoDeAutomacao(
  admin: AdminDb,
  e: { companyId: string; conversaId: string; agora?: Date; tetos?: Tetos },
): Promise<DecisaoDeTeto> {
  const agora = e.agora ?? new Date();
  const dia = new Date(agora.getTime() - 24 * 3600 * 1000).toISOString();
  const hora = new Date(agora.getTime() - 3600 * 1000).toISOString();

  const contar = async (q: ConsultaDb): Promise<number> => {
    const r = (await q) as unknown as { count?: number | null; error?: unknown };
    // Falha na contagem: NÃO libera. Não saber quantas já saíram não é licença
    // para enviar mais — o mesmo princípio do opt-out.
    if (r.error) return Number.POSITIVE_INFINITY;
    return typeof r.count === "number" ? r.count : 0;
  };

  const base = () =>
    (admin.from("wa_messages") as ConsultaDb)
      .select("id", { count: "exact", head: true })
      .eq("direction", "outbound")
      .eq("origin", "automation");

  const [naConversaHoje, naEmpresaNaHora] = await Promise.all([
    contar((base().eq("conversation_id", e.conversaId) as ConsultaDb).gte("created_at", dia)),
    contar((base().eq("company_id", e.companyId) as ConsultaDb).gte("created_at", hora)),
  ]);

  return decidirTeto({ naConversaHoje, naEmpresaNaHora }, e.tetos ?? tetosDoAmbiente());
}
