/**
 * Importa o gasto por anúncio da Meta para `ad_spend_daily`.
 *
 * Só servidor. Chamado pelo cron (todas as empresas com conta escolhida) e pelo
 * botão "Sincronizar agora" da tela (uma empresa, janela maior).
 *
 * Nunca lança por causa de token ou permissão: devolve o MOTIVO, porque quem
 * chama (cron ou tela) precisa mostrar "reconecte o Facebook" em vez de um erro
 * genérico — e o cron precisa seguir para a próxima empresa.
 */
import { buscarGastoDiario, MetaGraphError } from "./meta-graph.server";
import { tokenMorreu, motivoDaRevogacao } from "./meta-token-state.server";
import { fatiarJanela, janelaDeDatas, normalizarInsight, type LinhaDeGasto } from "@/modules/gasto/insights";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

export type MotivoDeFalha =
  | "sem_conexao"
  | "sem_ads_read"
  | "token_expirado"
  | "token_invalido"
  | "sem_conta"
  | "erro_da_meta";

export type ResultadoDaSincronizacao =
  | { ok: true; linhas: number; dias: number; conta: string }
  | { ok: false; motivo: MotivoDeFalha; detalhe: string };

/** Frase para a tela. Fica junto do código que decide o motivo, para não divergirem. */
export const TEXTO_DO_MOTIVO: Record<MotivoDeFalha, string> = {
  sem_conexao: "O Facebook ainda não foi conectado nesta empresa.",
  sem_ads_read:
    "A conexão com o Facebook não tem a permissão de anúncios (ads_read). Reconecte e aceite todas as permissões.",
  token_expirado: "O acesso ao Facebook venceu. Reconecte para voltar a importar o gasto.",
  token_invalido: "O Facebook invalidou o acesso. Reconecte para voltar a importar o gasto.",
  sem_conta: "Escolha qual conta de anúncios usar.",
  erro_da_meta: "A Meta recusou a consulta de gasto.",
};

const LOTE_DE_GRAVACAO = 500;

export async function contaDeAnuncioAtiva(admin: Admin, companyId: string) {
  const { data } = await admin
    .from("meta_assets")
    .select("id, external_id, name, metadata")
    .eq("company_id", companyId)
    .eq("asset_type", "ad_account")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return (data ?? null) as { id: string; external_id: string; name: string; metadata: any } | null;
}

async function anotarResultado(admin: Admin, conta: { id: string; metadata: any }, resultado: ResultadoDaSincronizacao) {
  // Anotação best-effort: falhar aqui não pode esconder o resultado da importação.
  await admin
    .from("meta_assets")
    .update({
      metadata: {
        ...(conta.metadata ?? {}),
        gasto_sincronizado_em: new Date().toISOString(),
        gasto_resultado: resultado.ok ? "ok" : resultado.motivo,
        gasto_detalhe: resultado.ok ? null : resultado.detalhe,
        gasto_linhas: resultado.ok ? resultado.linhas : null,
      },
    })
    .eq("id", conta.id)
    .then(() => undefined, () => undefined);
}

export async function sincronizarGastoDaEmpresa(
  admin: Admin,
  companyId: string,
  dias: number,
  agora: Date = new Date(),
): Promise<ResultadoDaSincronizacao> {
  const conta = await contaDeAnuncioAtiva(admin, companyId);
  if (!conta) return { ok: false, motivo: "sem_conta", detalhe: TEXTO_DO_MOTIVO.sem_conta };

  const falhar = async (motivo: MotivoDeFalha, detalhe?: string) => {
    const r: ResultadoDaSincronizacao = { ok: false, motivo, detalhe: detalhe ?? TEXTO_DO_MOTIVO[motivo] };
    await anotarResultado(admin, conta, r);
    return r;
  };

  const { data: conexao } = await admin
    .from("meta_lead_connections")
    .select("access_token, token_expires_at, granted_scopes, status")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!conexao?.access_token || conexao.status === "revoked") return falhar("sem_conexao");
  if (!(conexao.granted_scopes ?? []).includes("ads_read")) return falhar("sem_ads_read");
  // Não chama a Meta com um token que já se sabe vencido: a resposta seria um
  // 190 e, pior, daria a impressão de que a Meta está fora do ar.
  if (conexao.token_expires_at && Date.parse(conexao.token_expires_at) < agora.getTime()) {
    return falhar("token_expirado");
  }

  const janela = janelaDeDatas(dias, agora);
  const porChave = new Map<string, LinhaDeGasto>();
  try {
    for (const fatia of fatiarJanela(janela.desde, janela.ate)) {
      const brutas = await buscarGastoDiario(conta.external_id, conexao.access_token, fatia);
      for (const bruta of brutas) {
        const linha = normalizarInsight(bruta as any, conta.metadata?.moeda ?? "BRL");
        if (linha) porChave.set(`${linha.ad_id}|${linha.dia}`, linha);
      }
    }
  } catch (err) {
    if (tokenMorreu(err)) return falhar("token_invalido", motivoDaRevogacao(err));
    const mensagem = err instanceof MetaGraphError ? err.message : err instanceof Error ? err.message : String(err);
    return falhar("erro_da_meta", mensagem);
  }

  const agoraIso = agora.toISOString();
  const linhas = [...porChave.values()].map((l) => ({
    company_id: companyId,
    rede: "meta",
    conta_id: conta.external_id,
    ...l,
    sincronizado_em: agoraIso,
  }));

  for (let i = 0; i < linhas.length; i += LOTE_DE_GRAVACAO) {
    const { error } = await admin
      .from("ad_spend_daily")
      .upsert(linhas.slice(i, i + LOTE_DE_GRAVACAO), { onConflict: "company_id,rede,ad_id,dia" });
    if (error) return falhar("erro_da_meta", `Falha ao gravar o gasto: ${error.message}`);
  }

  const ok: ResultadoDaSincronizacao = { ok: true, linhas: linhas.length, dias, conta: conta.external_id };
  await anotarResultado(admin, conta, ok);
  return ok;
}
