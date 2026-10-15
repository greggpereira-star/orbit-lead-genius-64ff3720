/**
 * Papéis da empresa e o que cada um pode fazer com o WhatsApp.
 *
 *   owner, admin   administram o canal (conectar, templates, corte, regras)
 *   member         atende (envia, atribui, resolve)
 *   viewer         só lê
 *
 * Existia em três lugares, cada um com `limit(1)` sem ordem: quem tem mais de
 * uma empresa recebia empresa e papel de uma linha arbitrária. Aqui a ordem é
 * determinística (a membership mais antiga) — e quando a empresa ativa for
 * escolhida explicitamente pela sessão, é nesta função que ela entra.
 */

export type Papel = "owner" | "admin" | "member" | "viewer";

const ATENDEM: ReadonlySet<string> = new Set(["owner", "admin", "member"]);
const ADMINISTRAM: ReadonlySet<string> = new Set(["owner", "admin"]);

export const podeAtender = (papel: string): boolean => ATENDEM.has(papel);
export const podeAdministrar = (papel: string): boolean => ADMINISTRAM.has(papel);

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function papelNaEmpresa(
  admin: any,
  userId: string,
): Promise<{ companyId: string; role: string }> {
  const { data } = await admin
    .from("memberships")
    .select("company_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .order("company_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.company_id) throw new Error("Usuário sem empresa.");
  return { companyId: data.company_id as string, role: String(data.role ?? "viewer") };
}

/** Papel DESCONHECIDO vale como o menor (viewer): na dúvida, não deixa agir. */
export async function empresaParaAtender(admin: any, userId: string): Promise<string> {
  const { companyId, role } = await papelNaEmpresa(admin, userId);
  if (!podeAtender(role))
    throw new Error("Seu acesso é somente leitura: não é possível atender conversas.");
  return companyId;
}

export async function empresaParaAdministrar(admin: any, userId: string): Promise<string> {
  const { companyId, role } = await papelNaEmpresa(admin, userId);
  if (!podeAdministrar(role)) throw new Error("Apenas dono ou administrador pode fazer isso.");
  return companyId;
}

export async function empresaDoUsuario(admin: any, userId: string): Promise<string> {
  return (await papelNaEmpresa(admin, userId)).companyId;
}
