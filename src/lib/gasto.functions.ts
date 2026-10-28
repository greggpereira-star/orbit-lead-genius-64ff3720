/**
 * Gasto por anúncio: estado da conexão, escolha da conta e sincronização manual.
 *
 * A empresa vem SEMPRE do vínculo do usuário no servidor, nunca do navegador, e
 * escolher conta ou importar exige dono/administrador. A leitura do estado vale
 * para qualquer membro — é o que a tela do relatório precisa para explicar por
 * que não há gasto.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { papelNaEmpresa, podeAdministrar } from "@/lib/whatsapp/papeis";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function contexto(admin: any, userId: string, exigirAdmin: boolean) {
  const { companyId, role } = await papelNaEmpresa(admin, userId);
  if (exigirAdmin && !podeAdministrar(role)) {
    throw new Error("Apenas dono ou administrador pode configurar o gasto.");
  }
  return { companyId, role };
}

/** Intervalo mínimo entre importações manuais: a Meta limita chamadas por app. */
const INTERVALO_MANUAL_EM_MS = 60_000;

export interface EstadoDoGasto {
  conexao: "ausente" | "ok" | "vencida" | "revogada" | "sem_ads_read";
  venceEm: string | null;
  conta: { id: string; nome: string; moeda: string | null } | null;
  ultimaSincronizacao: string | null;
  ultimoResultado: string | null;
  ultimoDetalhe: string | null;
  linhas: number;
  ultimoDiaImportado: string | null;
  podeConfigurar: boolean;
}

export const estadoDoGasto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EstadoDoGasto> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId, role } = await contexto(admin, context.userId, false);
    const { contaDeAnuncioAtiva } = await import("@/lib/gasto-sync.server");

    const { data: conexao } = await admin
      .from("meta_lead_connections")
      .select("token_expires_at, granted_scopes, status")
      .eq("company_id", companyId)
      .maybeSingle();

    let situacao: EstadoDoGasto["conexao"] = "ok";
    if (!conexao) situacao = "ausente";
    else if (conexao.status === "revoked") situacao = "revogada";
    else if (!(conexao.granted_scopes ?? []).includes("ads_read")) situacao = "sem_ads_read";
    else if (conexao.token_expires_at && Date.parse(conexao.token_expires_at) < Date.now()) situacao = "vencida";

    const conta = await contaDeAnuncioAtiva(admin, companyId);
    const { data: ultimo } = await admin
      .from("ad_spend_daily")
      .select("dia")
      .eq("company_id", companyId)
      .order("dia", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { count } = await admin
      .from("ad_spend_daily")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);

    return {
      conexao: situacao,
      venceEm: conexao?.token_expires_at ?? null,
      conta: conta ? { id: conta.external_id, nome: conta.name, moeda: conta.metadata?.moeda ?? null } : null,
      ultimaSincronizacao: conta?.metadata?.gasto_sincronizado_em ?? null,
      ultimoResultado: conta?.metadata?.gasto_resultado ?? null,
      ultimoDetalhe: conta?.metadata?.gasto_detalhe ?? null,
      linhas: count ?? 0,
      ultimoDiaImportado: ultimo?.dia ?? null,
      podeConfigurar: podeAdministrar(role),
    };
  });

async function contasAcessiveis(admin: any, companyId: string) {
  const { data: conexao } = await admin
    .from("meta_lead_connections")
    .select("access_token, token_expires_at, granted_scopes, status")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!conexao?.access_token || conexao.status === "revoked") {
    return { ok: false as const, erro: "O Facebook ainda não foi conectado nesta empresa." };
  }
  if (!(conexao.granted_scopes ?? []).includes("ads_read")) {
    return { ok: false as const, erro: "A conexão não tem a permissão de anúncios (ads_read). Reconecte e aceite todas." };
  }
  if (conexao.token_expires_at && Date.parse(conexao.token_expires_at) < Date.now()) {
    return { ok: false as const, erro: "O acesso ao Facebook venceu. Reconecte para listar as contas." };
  }
  const { listarContasDeAnuncio } = await import("@/lib/meta-graph.server");
  const { tokenMorreu, motivoDaRevogacao } = await import("@/lib/meta-token-state.server");
  try {
    return { ok: true as const, contas: await listarContasDeAnuncio(conexao.access_token) };
  } catch (err) {
    if (tokenMorreu(err)) return { ok: false as const, erro: motivoDaRevogacao(err) };
    return { ok: false as const, erro: err instanceof Error ? err.message : "Falha ao consultar a Meta." };
  }
}

export const listarContasDeAnuncioDaEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId } = await contexto(admin, context.userId, true);
    return contasAcessiveis(admin, companyId);
  });

export const escolherContaDeAnuncio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ contaId: z.string().regex(/^act_\d+$/) }).parse(raw))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId } = await contexto(admin, context.userId, true);

    // Revalida contra a lista que o token realmente enxerga: a empresa só pode
    // apontar para uma conta a que a própria conexão dela tem acesso.
    const acessiveis = await contasAcessiveis(admin, companyId);
    if (!acessiveis.ok) throw new Error(acessiveis.erro);
    const conta = acessiveis.contas.find((c) => c.id === data.contaId);
    if (!conta) throw new Error("Essa conta de anúncios não está disponível para a conexão atual.");

    await admin
      .from("meta_assets")
      .update({ is_active: false })
      .eq("company_id", companyId)
      .eq("asset_type", "ad_account");

    const { error } = await admin.from("meta_assets").upsert(
      {
        company_id: companyId,
        asset_type: "ad_account",
        external_id: conta.id,
        name: conta.name,
        is_active: true,
        metadata: { moeda: conta.currency, account_status: conta.account_status },
      },
      { onConflict: "company_id,asset_type,external_id" },
    );
    if (error) throw new Error(error.message);

    await admin
      .from("audit_logs")
      .insert({
        company_id: companyId,
        user_id: context.userId,
        action: "conta_de_anuncio_escolhida",
        entity_type: "meta_assets",
        entity_id: conta.id,
        changes: { nome: conta.name },
      })
      .then(() => undefined, () => undefined);

    const { sincronizarGastoDaEmpresa } = await import("@/lib/gasto-sync.server");
    // Primeira carga já com histórico: uma tela vazia logo após escolher a conta
    // pareceria que não funcionou.
    const resultado = await sincronizarGastoDaEmpresa(admin, companyId, 90);
    return { ok: true as const, conta: { id: conta.id, nome: conta.name }, sincronizacao: resultado };
  });

export const sincronizarGastoAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ dias: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) }).parse(raw ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId } = await contexto(admin, context.userId, true);
    const { contaDeAnuncioAtiva, sincronizarGastoDaEmpresa } = await import("@/lib/gasto-sync.server");

    const conta = await contaDeAnuncioAtiva(admin, companyId);
    const ultima = conta?.metadata?.gasto_sincronizado_em as string | undefined;
    if (ultima && Date.now() - Date.parse(ultima) < INTERVALO_MANUAL_EM_MS) {
      throw new Error("Aguarde um minuto entre uma sincronização e outra.");
    }
    return sincronizarGastoDaEmpresa(admin, companyId, data.dias);
  });
