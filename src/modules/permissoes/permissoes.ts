/**
 * Permissões por empresa que o dono/administrador liga e desliga.
 *
 * Dono e administrador sempre podem; o visualizador nunca; o membro só quando a
 * empresa liberou. A mesma regra vive no banco (`pode_excluir_lead`), que é a
 * que vale de verdade — esta serve para a tela não oferecer o que o banco vai
 * recusar.
 */
export type PermissoesDaEmpresa = { membrosExcluemLeads: boolean };

export const PERMISSOES_PADRAO: PermissoesDaEmpresa = { membrosExcluemLeads: false };

export function normalizarPermissoes(raw: unknown): PermissoesDaEmpresa {
  const r = (raw ?? {}) as { membros_excluem_leads?: unknown; membrosExcluemLeads?: unknown };
  return { membrosExcluemLeads: (r.membros_excluem_leads ?? r.membrosExcluemLeads) === true };
}

export function podeExcluirLeads(papel: string | null | undefined, p: PermissoesDaEmpresa): boolean {
  if (papel === "owner" || papel === "admin") return true;
  return papel === "member" && p.membrosExcluemLeads;
}
