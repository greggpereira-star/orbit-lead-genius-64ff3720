/**
 * Chaves de API e webhooks de saída: gestão pela tela de Configurações.
 *
 * Regras que valem para todas as funções daqui:
 *  - a empresa vem do vínculo do usuário no servidor, nunca do navegador;
 *  - tudo exige dono ou administrador (o que a chave pode ler é a base inteira de leads);
 *  - criar chave/endpoint confere o PLANO no servidor — esconder o botão não protege nada;
 *  - o segredo (chave inteira, segredo do webhook) sai do servidor uma única vez,
 *    na resposta que cria ou rotaciona, e nunca mais.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EVENTOS_DE_WEBHOOK, ESCOPOS } from "@/lib/apiPublica/escopos";
import { papelNaEmpresa, podeAdministrar } from "@/lib/whatsapp/papeis";

/* eslint-disable @typescript-eslint/no-explicit-any */
const MAX_CHAVES_ATIVAS = 20;
const MAX_ENDPOINTS = 10;
const INTERVALO_DO_TESTE_EM_MS = 10_000;

const ultimoTeste = new Map<string, number>();

async function contexto(admin: any, userId: string, exigirAdmin = true) {
  const { companyId, role } = await papelNaEmpresa(admin, userId);
  const admin_ = podeAdministrar(role);
  if (exigirAdmin && !admin_) {
    throw new Error("Apenas dono ou administrador pode gerenciar a API e os webhooks.");
  }
  return { companyId, podeConfigurar: admin_ };
}

/**
 * Cifra o segredo em repouso (AES-256-GCM, a mesma chave dos tokens do WhatsApp).
 * Um dump do banco não pode permitir forjar assinaturas em nome da empresa.
 * Sem chave configurada falha fechado, com uma mensagem que o admin entende.
 */
async function cifrarSegredo(segredo: string): Promise<string> {
  try {
    return (await import("@/lib/whatsapp/cloud/cifra")).cifrarToken(segredo);
  } catch {
    throw new Error("A cifra de segredos não está configurada no servidor. Fale com a ALT.");
  }
}

async function auditar(
  admin: any,
  companyId: string,
  userId: string,
  action: string,
  entidade: string,
  id: string | null,
  changes: Record<string, unknown>,
) {
  await admin
    .from("audit_logs")
    .insert({
      company_id: companyId,
      user_id: userId,
      action,
      entity_type: entidade,
      entity_id: id,
      changes,
    })
    .then(
      () => {},
      () => {},
    );
}

export interface ChaveListada {
  id: string;
  nome: string;
  prefixo: string;
  escopos: string[];
  criadaEm: string;
  expiraEm: string | null;
  ultimoUsoEm: string | null;
  revogadaEm: string | null;
}

export interface EndpointListado {
  id: string;
  nome: string;
  url: string;
  eventos: string[];
  ativo: boolean;
  falhasSeguidas: number;
  desativadoMotivo: string | null;
  criadaEm: string;
  ultimaEntregaEm: string | null;
}

export interface EstadoDeDesenvolvedor {
  podeConfigurar: boolean;
  apiIncluida: boolean;
  webhooksIncluidos: boolean;
  chaves: ChaveListada[];
  endpoints: EndpointListado[];
}

export const estadoDeDesenvolvedor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EstadoDeDesenvolvedor> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { temRecurso } = await import("@/lib/planos.server");
    const admin = supabaseAdmin as any;
    const { companyId, podeConfigurar } = await contexto(admin, context.userId, false);

    const [apiIncluida, webhooksIncluidos] = await Promise.all([
      temRecurso(admin, companyId, "api_publica"),
      temRecurso(admin, companyId, "webhooks_assinados"),
    ]);
    // Quem não administra não vê nem a lista: o prefixo da chave e a URL do destino são da gestão.
    if (!podeConfigurar) {
      return { podeConfigurar, apiIncluida, webhooksIncluidos, chaves: [], endpoints: [] };
    }

    const [chaves, endpoints] = await Promise.all([
      admin
        .from("api_keys")
        .select("id, nome, prefixo, escopos, criada_em, expira_em, ultimo_uso_em, revogada_em")
        .eq("company_id", companyId)
        .order("criada_em", { ascending: false }),
      admin
        .from("webhook_endpoints")
        .select(
          "id, nome, url, eventos, ativo, falhas_seguidas, desativado_motivo, criada_em, ultima_entrega_em",
        )
        .eq("company_id", companyId)
        .order("criada_em", { ascending: false }),
    ]);

    return {
      podeConfigurar,
      apiIncluida,
      webhooksIncluidos,
      chaves: ((chaves.data ?? []) as any[]).map((c) => ({
        id: c.id,
        nome: c.nome,
        prefixo: c.prefixo,
        escopos: c.escopos,
        criadaEm: c.criada_em,
        expiraEm: c.expira_em,
        ultimoUsoEm: c.ultimo_uso_em,
        revogadaEm: c.revogada_em,
      })),
      endpoints: ((endpoints.data ?? []) as any[]).map((e) => ({
        id: e.id,
        nome: e.nome,
        url: e.url,
        eventos: e.eventos,
        ativo: e.ativo,
        falhasSeguidas: e.falhas_seguidas,
        desativadoMotivo: e.desativado_motivo,
        criadaEm: e.criada_em,
        ultimaEntregaEm: e.ultima_entrega_em,
      })),
    };
  });

// --- Chaves ---------------------------------------------------------------

export const criarChaveDeApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        nome: z.string().trim().min(1).max(80),
        escopos: z.array(z.enum(ESCOPOS)).min(1).max(ESCOPOS.length),
        expiraEmDias: z.number().int().min(1).max(730).nullable().optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { exigirRecurso } = await import("@/lib/planos.server");
    const { gerarChave } = await import("@/lib/apiPublica/chaves.server");
    const admin = supabaseAdmin as any;
    const { companyId } = await contexto(admin, context.userId);
    await exigirRecurso(admin, companyId, "api_publica");

    const { count } = await admin
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("revogada_em", null);
    if ((count ?? 0) >= MAX_CHAVES_ATIVAS) {
      throw new Error(
        `Limite de ${MAX_CHAVES_ATIVAS} chaves ativas. Revogue alguma antes de criar outra.`,
      );
    }

    const { chave, prefixo, hash } = gerarChave();
    const expiraEm = data.expiraEmDias
      ? new Date(Date.now() + data.expiraEmDias * 86_400_000).toISOString()
      : null;
    const { data: criada, error } = await admin
      .from("api_keys")
      .insert({
        company_id: companyId,
        nome: data.nome,
        prefixo,
        hash,
        escopos: [...new Set(data.escopos)],
        criada_por: context.userId,
        expira_em: expiraEm,
      })
      .select("id")
      .single();
    if (error) throw new Error("Não foi possível criar a chave.");

    await auditar(admin, companyId, context.userId, "api_key_criada", "api_keys", criada.id, {
      nome: data.nome,
      escopos: data.escopos,
      expira_em: expiraEm,
    });
    // A chave inteira só existe nesta resposta.
    return { id: criada.id as string, chave, prefixo };
  });

export const revogarChaveDeApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId } = await contexto(admin, context.userId);

    // `company_id` no filtro: um id de outra empresa não revoga nada.
    const { data: revogada, error } = await admin
      .from("api_keys")
      .update({ revogada_em: new Date().toISOString() })
      .eq("id", data.id)
      .eq("company_id", companyId)
      .is("revogada_em", null)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível revogar a chave.");
    if (!revogada) throw new Error("Chave não encontrada ou já revogada.");

    await auditar(admin, companyId, context.userId, "api_key_revogada", "api_keys", data.id, {});
    return { ok: true as const };
  });

// --- Webhooks -------------------------------------------------------------

const urlDoWebhook = z.string().trim().min(8).max(2000);

export const criarEndpointDeWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        nome: z.string().trim().min(1).max(80),
        url: urlDoWebhook,
        eventos: z.array(z.enum(EVENTOS_DE_WEBHOOK)).min(1).max(EVENTOS_DE_WEBHOOK.length),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { exigirRecurso } = await import("@/lib/planos.server");
    const { validarDestinoDeWebhook } = await import("@/lib/redeSegura.server");
    const { gerarSegredoDeWebhook } = await import("@/lib/webhooks/assinatura.server");
    const admin = supabaseAdmin as any;
    const { companyId } = await contexto(admin, context.userId);
    await exigirRecurso(admin, companyId, "webhooks_assinados");

    const destino = await validarDestinoDeWebhook(data.url);
    if (!destino.ok) throw new Error(`URL recusada: ${destino.motivo}.`);

    const { count } = await admin
      .from("webhook_endpoints")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId);
    if ((count ?? 0) >= MAX_ENDPOINTS) {
      throw new Error(`Limite de ${MAX_ENDPOINTS} destinos. Remova algum antes de criar outro.`);
    }

    const segredo = gerarSegredoDeWebhook();
    const { data: criado, error } = await admin
      .from("webhook_endpoints")
      .insert({
        company_id: companyId,
        nome: data.nome,
        url: destino.url.toString(),
        segredo: await cifrarSegredo(segredo),
        eventos: [...new Set(data.eventos)],
        criada_por: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error("Não foi possível criar o destino.");

    await auditar(
      admin,
      companyId,
      context.userId,
      "webhook_criado",
      "webhook_endpoints",
      criado.id,
      {
        nome: data.nome,
        url: destino.url.toString(),
        eventos: data.eventos,
      },
    );
    return { id: criado.id as string, segredo };
  });

export const atualizarEndpointDeWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        ativo: z.boolean().optional(),
        eventos: z
          .array(z.enum(EVENTOS_DE_WEBHOOK))
          .min(1)
          .max(EVENTOS_DE_WEBHOOK.length)
          .optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { exigirRecurso } = await import("@/lib/planos.server");
    const admin = supabaseAdmin as any;
    const { companyId } = await contexto(admin, context.userId);

    const mudanca: Record<string, unknown> = {};
    if (data.eventos) mudanca.eventos = [...new Set(data.eventos)];
    if (data.ativo !== undefined) {
      // Religar também é "usar o recurso": sem plano, não religa.
      if (data.ativo) await exigirRecurso(admin, companyId, "webhooks_assinados");
      mudanca.ativo = data.ativo;
      if (data.ativo) Object.assign(mudanca, { falhas_seguidas: 0, desativado_motivo: null });
      else mudanca.desativado_motivo = "Desativado manualmente.";
    }
    if (Object.keys(mudanca).length === 0) return { ok: true as const };

    const { data: atualizado, error } = await admin
      .from("webhook_endpoints")
      .update(mudanca)
      .eq("id", data.id)
      .eq("company_id", companyId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível atualizar o destino.");
    if (!atualizado) throw new Error("Destino não encontrado.");

    await auditar(
      admin,
      companyId,
      context.userId,
      "webhook_atualizado",
      "webhook_endpoints",
      data.id,
      {
        ativo: data.ativo,
        eventos: data.eventos,
      },
    );
    return { ok: true as const };
  });

export const rotacionarSegredoDeWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { gerarSegredoDeWebhook } = await import("@/lib/webhooks/assinatura.server");
    const admin = supabaseAdmin as any;
    const { companyId } = await contexto(admin, context.userId);

    const segredo = gerarSegredoDeWebhook();
    const { data: atualizado, error } = await admin
      .from("webhook_endpoints")
      .update({ segredo: await cifrarSegredo(segredo) })
      .eq("id", data.id)
      .eq("company_id", companyId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível trocar o segredo.");
    if (!atualizado) throw new Error("Destino não encontrado.");

    await auditar(
      admin,
      companyId,
      context.userId,
      "webhook_segredo_rotacionado",
      "webhook_endpoints",
      data.id,
      {},
    );
    return { segredo };
  });

export const removerEndpointDeWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId } = await contexto(admin, context.userId);

    const { data: removido, error } = await admin
      .from("webhook_endpoints")
      .delete()
      .eq("id", data.id)
      .eq("company_id", companyId)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não foi possível remover o destino.");
    if (!removido) throw new Error("Destino não encontrado.");

    await auditar(
      admin,
      companyId,
      context.userId,
      "webhook_removido",
      "webhook_endpoints",
      data.id,
      {},
    );
    return { ok: true as const };
  });

export const enviarTesteDeWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { exigirRecurso } = await import("@/lib/planos.server");
    const { validarDestinoDeWebhook } = await import("@/lib/redeSegura.server");
    const { postarAssinado } = await import("@/lib/webhooks/entrega.server");
    const admin = supabaseAdmin as any;
    const { companyId } = await contexto(admin, context.userId);
    await exigirRecurso(admin, companyId, "webhooks_assinados");

    const agora = Date.now();
    if (agora - (ultimoTeste.get(data.id) ?? 0) < INTERVALO_DO_TESTE_EM_MS) {
      throw new Error("Aguarde alguns segundos antes de enviar outro teste.");
    }
    ultimoTeste.set(data.id, agora);

    const { data: ep } = await admin
      .from("webhook_endpoints")
      .select("id, url, segredo")
      .eq("id", data.id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (!ep) throw new Error("Destino não encontrado.");

    const destino = await validarDestinoDeWebhook(ep.url);
    if (!destino.ok)
      return { ok: false as const, status: null, erro: `destino recusado: ${destino.motivo}` };

    let segredoEmClaro: string;
    try {
      segredoEmClaro = (await import("@/lib/whatsapp/cloud/cifra")).decifrarToken(ep.segredo);
    } catch {
      return {
        ok: false as const,
        status: null,
        erro: "não foi possível ler o segredo de assinatura",
      };
    }

    const eventId = crypto.randomUUID();
    const r = await postarAssinado({
      url: destino.url,
      segredo: segredoEmClaro,
      evento: "webhook.test",
      entregaId: crypto.randomUUID(),
      eventId,
      tentativa: 1,
      payload: {
        id: eventId,
        type: "webhook.test",
        created_at: new Date().toISOString(),
        data: { message: "Teste de conexão enviado pelo Leadflow." },
      },
    });
    return { ok: r.ok, status: r.status, erro: r.erro };
  });

export interface EntregaListada {
  id: string;
  evento: string;
  status: string;
  tentativas: number;
  ultimoStatus: number | null;
  ultimoErro: string | null;
  criadaEm: string;
  proximaTentativaEm: string | null;
}

export const entregasDoEndpoint = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }): Promise<EntregaListada[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId } = await contexto(admin, context.userId);

    const { data: linhas } = await admin
      .from("webhook_deliveries")
      .select(
        "id, evento, status, attempts, ultimo_status, ultimo_erro, criada_em, proxima_tentativa_em",
      )
      .eq("endpoint_id", data.id)
      .eq("company_id", companyId)
      .order("criada_em", { ascending: false })
      .limit(20);
    return ((linhas ?? []) as any[]).map((l) => ({
      id: l.id,
      evento: l.evento,
      status: l.status,
      tentativas: l.attempts,
      ultimoStatus: l.ultimo_status,
      ultimoErro: l.ultimo_erro,
      criadaEm: l.criada_em,
      proximaTentativaEm: l.status === "pending" ? l.proxima_tentativa_em : null,
    }));
  });
