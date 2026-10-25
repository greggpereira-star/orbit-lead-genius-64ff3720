/**
 * Equipe da empresa: membros, convites e papéis.
 *
 * Tudo passa por aqui (chave de serviço): o navegador não escreve em `company_invites`
 * nem altera vínculos. Dono e administrador gerenciam; as regras finas de quem pode
 * convidar/alterar/remover quem estão em `equipe/regras.ts` e são conferidas de novo no
 * servidor, nunca só na tela.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { papelNaEmpresa, podeAdministrar } from "@/lib/whatsapp/papeis";
import {
  emailValido,
  normalizarEmail,
  podeAlterarPapel,
  podeConvidar,
  podeRemover,
} from "@/lib/equipe/regras";

/* eslint-disable @typescript-eslint/no-explicit-any */
async function contextoDeAdministracao(admin: any, userId: string) {
  const { companyId, role } = await papelNaEmpresa(admin, userId);
  if (!podeAdministrar(role)) throw new Error("Apenas dono ou administrador pode fazer isso.");
  return { companyId, role };
}

async function registrar(
  admin: any,
  a: { companyId: string; userId: string; action: string; entityId?: string | null; changes?: unknown },
) {
  // A trilha é complementar: se falhar, a operação já feita não deve ser desfeita nem escondida.
  await admin
    .from("audit_logs")
    .insert({
      company_id: a.companyId,
      user_id: a.userId,
      action: a.action,
      entity_type: "equipe",
      entity_id: a.entityId ?? null,
      changes: a.changes ?? null,
    })
    .then(() => undefined, () => undefined);
}

const hashDoToken = async (token: string) => {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(token).digest("hex");
};

export const listarEquipe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId, role } = await contextoDeAdministracao(admin, context.userId);

    const { data: vinculos } = await admin
      .from("memberships")
      .select("user_id, role, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true });
    const ids = ((vinculos ?? []) as Array<{ user_id: string }>).map((v) => v.user_id);
    const { data: perfis } = ids.length
      ? await admin.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] };
    const perfil = new Map<string, { full_name: string | null; email: string | null }>(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((p) => [p.id, p]),
    );

    const { data: convites } = await admin
      .from("company_invites")
      .select("id, email, role, created_at, expires_at, invited_by")
      .eq("company_id", companyId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });

    return {
      euId: context.userId as string,
      meuPapel: role as string,
      membros: ((vinculos ?? []) as Array<{ user_id: string; role: string; created_at: string }>).map((v) => ({
        userId: v.user_id,
        papel: String(v.role),
        desde: v.created_at,
        nome: perfil.get(v.user_id)?.full_name ?? "",
        email: perfil.get(v.user_id)?.email ?? "",
      })),
      convites: ((convites ?? []) as Array<{ id: string; email: string; role: string; created_at: string; expires_at: string }>).map(
        (c) => ({ id: c.id, email: c.email, papel: c.role, criadoEm: c.created_at, expiraEm: c.expires_at }),
      ),
    };
  });

export const criarConvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ email: z.string().max(254), papel: z.enum(["admin", "member", "viewer"]) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId, role } = await contextoDeAdministracao(admin, context.userId);

    if (!podeConvidar(role, data.papel)) throw new Error("Você não pode convidar alguém com esse papel.");
    const email = normalizarEmail(data.email);
    if (!emailValido(email)) throw new Error("Informe um e-mail válido.");

    // Hoje o convite serve a quem ainda não tem cadastro: quem já tem conta cairia na empresa
    // que criou para si, e o sistema ainda não troca de empresa ativa.
    const { data: perfil } = await admin.from("profiles").select("id").eq("email", email).limit(1).maybeSingle();
    if (perfil?.id) {
      const { data: jaMembro } = await admin
        .from("memberships")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", perfil.id)
        .maybeSingle();
      throw new Error(
        jaMembro
          ? "Esta pessoa já faz parte da equipe."
          : "Este e-mail já tem uma conta no sistema. Por enquanto o convite é só para quem ainda não tem cadastro.",
      );
    }

    // Reenviar = o convite pendente anterior deixa de valer.
    await admin
      .from("company_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("email", email)
      .is("accepted_at", null)
      .is("revoked_at", null);

    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(32).toString("base64url");
    const { data: criado, error } = await admin
      .from("company_invites")
      .insert({
        company_id: companyId,
        email,
        role: data.papel,
        token_hash: await hashDoToken(token),
        invited_by: context.userId,
      })
      .select("id, expires_at")
      .single();
    if (error) throw new Error("Não foi possível criar o convite.");

    await registrar(admin, {
      companyId,
      userId: context.userId,
      action: "convite_criado",
      entityId: criado.id,
      changes: { email, papel: data.papel },
    });
    // O código sai só aqui, uma vez: depois só existe o hash.
    return { id: criado.id as string, token, expiraEm: criado.expires_at as string, email, papel: data.papel };
  });

export const revogarConvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId, role } = await contextoDeAdministracao(admin, context.userId);

    const { data: conv } = await admin
      .from("company_invites")
      .select("id, email, role")
      .eq("id", data.id)
      .eq("company_id", companyId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .maybeSingle();
    if (!conv) throw new Error("Convite não encontrado.");
    if (!podeConvidar(role, conv.role)) throw new Error("Você não pode revogar este convite.");

    await admin.from("company_invites").update({ revoked_at: new Date().toISOString() }).eq("id", conv.id);
    await registrar(admin, { companyId, userId: context.userId, action: "convite_revogado", entityId: conv.id, changes: { email: conv.email, papel: conv.role } });
    return { ok: true as const };
  });

export const alterarPapelDoMembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ userId: z.string().uuid(), papel: z.enum(["admin", "member", "viewer"]) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId, role } = await contextoDeAdministracao(admin, context.userId);

    const { data: alvo } = await admin
      .from("memberships")
      .select("id, role")
      .eq("company_id", companyId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!alvo) throw new Error("Membro não encontrado.");
    if (!podeAlterarPapel({ quem: role, ehEuMesmo: data.userId === context.userId, papelAtual: String(alvo.role), novoPapel: data.papel }))
      throw new Error("Você não pode alterar o papel desta pessoa.");

    const { error } = await admin.from("memberships").update({ role: data.papel }).eq("id", alvo.id);
    if (error) throw new Error("Não foi possível alterar o papel.");
    await registrar(admin, { companyId, userId: context.userId, action: "papel_alterado", entityId: data.userId, changes: { de: String(alvo.role), para: data.papel } });
    return { ok: true as const };
  });

export const removerMembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ userId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { companyId, role } = await contextoDeAdministracao(admin, context.userId);

    const { data: alvo } = await admin
      .from("memberships")
      .select("id, role")
      .eq("company_id", companyId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!alvo) throw new Error("Membro não encontrado.");
    if (!podeRemover({ quem: role, ehEuMesmo: data.userId === context.userId, papelAtual: String(alvo.role) }))
      throw new Error("Você não pode remover esta pessoa.");

    const { error } = await admin.from("memberships").delete().eq("id", alvo.id);
    if (error) throw new Error("Não foi possível remover o membro.");
    await registrar(admin, { companyId, userId: context.userId, action: "membro_removido", entityId: data.userId, changes: { papel: String(alvo.role) } });
    return { ok: true as const };
  });

/**
 * Consulta PÚBLICA do convite (quem abre o link ainda não tem conta). Devolve o mínimo para
 * montar a tela de cadastro e a MESMA resposta para qualquer motivo de invalidez: não revela
 * se o código existiu, venceu, foi usado ou revogado.
 */
export const consultarConvite = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ token: z.string().min(20).max(120) }).parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: conv } = await admin
      .from("company_invites")
      .select("email, role, expires_at, company_id")
      .eq("token_hash", await hashDoToken(data.token))
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!conv) return { valido: false as const };
    const { data: empresa } = await admin.from("companies").select("name").eq("id", conv.company_id).maybeSingle();
    return {
      valido: true as const,
      email: conv.email as string,
      papel: String(conv.role),
      empresa: (empresa?.name as string | undefined) ?? "a equipe",
      expiraEm: conv.expires_at as string,
    };
  });
