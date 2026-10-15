/**
 * Conexão de um número (Embedded Signup) e gestão de templates.
 *
 * A empresa vem SEMPRE do chamador autenticado (membership) — nunca de campo do
 * navegador. O `phone_number_id` que o navegador informa é só uma afirmação a
 * conferir: o token, trocado pelo código no servidor, é que prova o acesso.
 */

import { cifrarToken, decifrarToken } from "./cifra";
import {
  apagarTemplateNaMeta,
  criarTemplateNaMeta,
  inscreverAppNaWaba,
  lerNumero,
  listarTemplatesDaWaba,
  pedirSincronizacaoDoApp,
  trocarCodigoPorToken,
} from "./graph";
import type { DbWa } from "./processador";
import {
  montarComponentes,
  temErro,
  validarTemplate,
  type DefinicaoDeTemplate,
  type Problema,
} from "./templates";

/* eslint-disable @typescript-eslint/no-explicit-any */
const tabela = (db: DbWa, nome: string): any => db.from(nome);

export type EtapaDoOnboarding = "troca" | "numero" | "posse" | "inscricao" | "gravacao";

export type ResultadoDoOnboarding =
  | {
      ok: true;
      numero: {
        phoneNumberId: string;
        displayPhone: string;
        verifiedName: string | null;
        quality: string | null;
        tier: string | null;
        modo: "coexistence" | "cloud_only";
      };
      sincronizacao: { historico: boolean; contatos: boolean };
    }
  | { ok: false; etapa: EtapaDoOnboarding; texto: string };

export async function concluirOnboarding(
  db: DbWa,
  e: {
    appId: string;
    appSecret: string;
    companyId: string;
    userId: string | null;
    code: string;
    wabaId: string;
    phoneNumberId: string;
  },
): Promise<ResultadoDoOnboarding> {
  // 1) código → token
  const troca = await trocarCodigoPorToken({
    appId: e.appId,
    appSecret: e.appSecret,
    code: e.code,
  });
  if (!troca.ok || !troca.data.access_token) {
    return {
      ok: false,
      etapa: "troca",
      texto: troca.ok
        ? "A Meta não devolveu o acesso."
        : `Não foi possível validar a autorização: ${troca.erro.mensagem}`,
    };
  }
  const token = troca.data.access_token;

  // 2) o número existe e está acessível com este token
  const num = await lerNumero(e.phoneNumberId, token);
  if (!num.ok) {
    return { ok: false, etapa: "numero", texto: `Não consegui ler o número: ${num.erro.mensagem}` };
  }

  // 3) posse: um número já ligado a OUTRA empresa não pode ser reivindicado
  const { data: existente } = await tabela(db, "wa_phone_numbers")
    .select("company_id")
    .eq("phone_number_id", e.phoneNumberId)
    .maybeSingle();
  if (existente && existente.company_id !== e.companyId) {
    return { ok: false, etapa: "posse", texto: "Este número já está conectado a outra conta." };
  }

  // 4) inscrição nos webhooks — sem ela nada chega
  const insc = await inscreverAppNaWaba(e.wabaId, token);
  if (!insc.ok) {
    return {
      ok: false,
      etapa: "inscricao",
      texto: `Não consegui ativar o recebimento de mensagens: ${insc.erro.mensagem}`,
    };
  }

  // 5) gravação
  const modo: "coexistence" | "cloud_only" =
    num.data.is_on_biz_app === true ? "coexistence" : "cloud_only";
  try {
    const { data: conta, error: erroConta } = await tabela(db, "wa_accounts")
      .upsert(
        {
          company_id: e.companyId,
          waba_id: e.wabaId,
          display_name: num.data.verified_name ?? null,
          status: "active",
        },
        { onConflict: "company_id,waba_id" },
      )
      .select("id")
      .maybeSingle();
    if (erroConta || !conta?.id) throw new Error(erroConta?.message ?? "conta não gravada");

    const { error: erroNumero } = await tabela(db, "wa_phone_numbers").upsert(
      {
        account_id: conta.id,
        company_id: e.companyId,
        phone_number_id: e.phoneNumberId,
        display_phone: (num.data.display_phone_number ?? "").replace(/\D/g, ""),
        mode: modo,
        quality: num.data.quality_rating ?? null,
        messaging_tier: num.data.messaging_limit_tier ?? null,
        is_on_biz_app: num.data.is_on_biz_app ?? null,
        status: "active",
        disconnected_at: null,
        disconnection_reason: null,
        webhook_subscribed_at: new Date().toISOString(),
        last_health_at: new Date().toISOString(),
      },
      { onConflict: "phone_number_id" },
    );
    if (erroNumero) throw new Error(erroNumero.message);

    const { error: erroCred } = await tabela(db, "wa_credentials").upsert(
      {
        account_id: conta.id,
        access_token_enc: cifrarToken(token),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );
    if (erroCred) throw new Error(erroCred.message);
  } catch (err) {
    return {
      ok: false,
      etapa: "gravacao",
      texto: err instanceof Error ? err.message : "Falha ao salvar a conexão.",
    };
  }

  // 6) coexistência: histórico e contatos (uma vez; janela de 24h para concluir)
  const sincronizacao = { historico: false, contatos: false };
  if (modo === "coexistence") {
    const [h, c] = await Promise.all([
      pedirSincronizacaoDoApp(e.phoneNumberId, token, "history"),
      pedirSincronizacaoDoApp(e.phoneNumberId, token, "smb_app_state_sync"),
    ]);
    sincronizacao.historico = h.ok;
    sincronizacao.contatos = c.ok;
  }

  return {
    ok: true,
    numero: {
      phoneNumberId: e.phoneNumberId,
      displayPhone: (num.data.display_phone_number ?? "").replace(/\D/g, ""),
      verifiedName: num.data.verified_name ?? null,
      quality: num.data.quality_rating ?? null,
      tier: num.data.messaging_limit_tier ?? null,
      modo,
    },
    sincronizacao,
  };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

interface ContaComToken {
  accountId: string;
  wabaId: string;
  token: string;
}

async function contaDaEmpresa(db: DbWa, companyId: string): Promise<ContaComToken | null> {
  const { data: conta } = await tabela(db, "wa_accounts")
    .select("id, waba_id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();
  if (!conta?.id) return null;
  const { data: cred } = await tabela(db, "wa_credentials")
    .select("access_token_enc")
    .eq("account_id", conta.id)
    .maybeSingle();
  if (!cred?.access_token_enc) return null;
  return {
    accountId: conta.id,
    wabaId: conta.waba_id,
    token: decifrarToken(cred.access_token_enc),
  };
}

export type ResultadoDeTemplates = { ok: true; total: number } | { ok: false; texto: string };

export async function sincronizarTemplates(
  db: DbWa,
  companyId: string,
): Promise<ResultadoDeTemplates> {
  const conta = await contaDaEmpresa(db, companyId);
  if (!conta) return { ok: false, texto: "Conecte um número do WhatsApp primeiro." };

  const r = await listarTemplatesDaWaba(conta.wabaId, conta.token);
  if (!r.ok) return { ok: false, texto: `Não consegui ler os templates: ${r.erro.mensagem}` };

  if (r.data.length === 0) return { ok: true, total: 0 };
  const agora = new Date().toISOString();
  const linhas = r.data.map((t) => ({
    account_id: conta.accountId,
    company_id: companyId,
    provider_template_id: t.id ?? null,
    name: t.name,
    language: t.language,
    category: t.category,
    status: String(t.status ?? "PENDING").toUpperCase(),
    components: t.components ?? [],
    rejection_reason: t.rejected_reason && t.rejected_reason !== "NONE" ? t.rejected_reason : null,
    quality: t.quality_score?.score ?? null,
    synced_at: agora,
    updated_at: agora,
  }));
  const { error } = await tabela(db, "wa_templates").upsert(linhas, {
    onConflict: "account_id,name,language",
  });
  if (error) return { ok: false, texto: `Falha ao salvar os templates: ${error.message}` };
  return { ok: true, total: linhas.length };
}

export type ResultadoDeCriacao =
  | { ok: true; status: string; providerTemplateId: string | null }
  | { ok: false; texto: string; problemas?: Problema[] };

export async function criarTemplate(
  db: DbWa,
  e: { companyId: string; userId: string | null; definicao: DefinicaoDeTemplate },
): Promise<ResultadoDeCriacao> {
  const problemas = validarTemplate(e.definicao);
  if (temErro(problemas)) {
    return { ok: false, texto: "Corrija os itens destacados antes de enviar.", problemas };
  }

  const conta = await contaDaEmpresa(db, e.companyId);
  if (!conta) return { ok: false, texto: "Conecte um número do WhatsApp primeiro." };

  const componentes = montarComponentes(e.definicao);
  const r = await criarTemplateNaMeta(conta.wabaId, conta.token, {
    name: e.definicao.nome,
    language: e.definicao.idioma,
    category: e.definicao.categoria,
    components: componentes,
  });
  if (!r.ok) return { ok: false, texto: r.erro.mensagem };

  const status = String(r.data.status ?? "PENDING").toUpperCase();
  const agora = new Date().toISOString();
  await tabela(db, "wa_templates").upsert(
    {
      account_id: conta.accountId,
      company_id: e.companyId,
      provider_template_id: r.data.id ?? null,
      name: e.definicao.nome,
      language: e.definicao.idioma,
      category: String(r.data.category ?? e.definicao.categoria).toUpperCase(),
      status,
      components: componentes,
      created_by: e.userId,
      synced_at: agora,
      updated_at: agora,
    },
    { onConflict: "account_id,name,language" },
  );
  return { ok: true, status, providerTemplateId: r.data.id ?? null };
}

export async function apagarTemplate(
  db: DbWa,
  e: { companyId: string; nome: string },
): Promise<{ ok: true } | { ok: false; texto: string }> {
  const conta = await contaDaEmpresa(db, e.companyId);
  if (!conta) return { ok: false, texto: "Conecte um número do WhatsApp primeiro." };
  const r = await apagarTemplateNaMeta(conta.wabaId, conta.token, e.nome);
  if (!r.ok) return { ok: false, texto: r.erro.mensagem };
  await tabela(db, "wa_templates").delete().eq("account_id", conta.accountId).eq("name", e.nome);
  return { ok: true };
}
