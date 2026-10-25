/**
 * Confere no servidor as permissões por empresa que mudam por configuração.
 * Usa a chave de serviço (passada de fora), então lê a configuração sem RLS.
 */
import { normalizarPermissoes, podeExportar, PERMISSOES_PADRAO } from "@/modules/permissoes/permissoes";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function podeExportarNaEmpresa(admin: any, companyId: string, userId: string): Promise<boolean> {
  const { data: membro } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!membro) return false;
  const papel = String(membro.role ?? "viewer");
  if (papel === "owner" || papel === "admin") return true;
  const { data } = await admin
    .from("company_permissoes")
    .select("membros_exportam")
    .eq("company_id", companyId)
    .maybeSingle();
  return podeExportar(papel, data ? normalizarPermissoes(data) : PERMISSOES_PADRAO);
}

export const SEM_PERMISSAO_PARA_EXPORTAR =
  "Você não tem permissão para exportar dados. Peça a um administrador.";
