/**
 * Permissões por empresa que o dono/administrador liga e desliga.
 *
 * Dono e administrador sempre podem; o visualizador nunca; o membro só quando a
 * empresa liberou. A mesma regra vive no banco (`pode_excluir_lead`), que é a
 * que vale de verdade — esta serve para a tela não oferecer o que o banco vai
 * recusar.
 */
export type PermissoesDaEmpresa = {
  membrosExcluemLeads: boolean;
  membrosExportam: boolean;
  membrosGerenciamEtapas: boolean;
  /** Etiqueta NOVA. Aplicar uma que a empresa já usa é livre mesmo com isto desligado. */
  membrosCriamEtiquetas: boolean;
  membrosCriamCampos: boolean;
};

export type TipoDeEstrutura = "etapas" | "etiquetas" | "campos";

export const PERMISSOES_PADRAO: PermissoesDaEmpresa = {
  membrosExcluemLeads: false,
  membrosExportam: false,
  membrosGerenciamEtapas: false,
  membrosCriamEtiquetas: true,
  membrosCriamCampos: false,
};

export function normalizarPermissoes(raw: unknown): PermissoesDaEmpresa {
  const r = (raw ?? {}) as {
    membros_excluem_leads?: unknown;
    membrosExcluemLeads?: unknown;
    membros_exportam?: unknown;
    membrosExportam?: unknown;
    membros_gerenciam_etapas?: unknown;
    membrosGerenciamEtapas?: unknown;
    membros_criam_etiquetas?: unknown;
    membrosCriamEtiquetas?: unknown;
    membros_criam_campos?: unknown;
    membrosCriamCampos?: unknown;
  };
  // Etiqueta é a única que vale VERDADEIRO sem configuração: só um `false` explícito a desliga.
  return {
    membrosExcluemLeads: (r.membros_excluem_leads ?? r.membrosExcluemLeads) === true,
    membrosExportam: (r.membros_exportam ?? r.membrosExportam) === true,
    membrosGerenciamEtapas: (r.membros_gerenciam_etapas ?? r.membrosGerenciamEtapas) === true,
    membrosCriamEtiquetas: (r.membros_criam_etiquetas ?? r.membrosCriamEtiquetas) !== false,
    membrosCriamCampos: (r.membros_criam_campos ?? r.membrosCriamCampos) === true,
  };
}

export function podeExcluirLeads(papel: string | null | undefined, p: PermissoesDaEmpresa): boolean {
  if (papel === "owner" || papel === "admin") return true;
  return papel === "member" && p.membrosExcluemLeads;
}

export function podeExportar(papel: string | null | undefined, p: PermissoesDaEmpresa): boolean {
  if (papel === "owner" || papel === "admin") return true;
  return papel === "member" && p.membrosExportam;
}

/** Criar/alterar etapas, criar etiquetas novas, criar/alterar campos. */
export function podeGerenciar(
  papel: string | null | undefined,
  p: PermissoesDaEmpresa,
  tipo: TipoDeEstrutura,
): boolean {
  if (papel === "owner" || papel === "admin") return true;
  if (papel !== "member") return false;
  return tipo === "etapas"
    ? p.membrosGerenciamEtapas
    : tipo === "etiquetas"
      ? p.membrosCriamEtiquetas
      : p.membrosCriamCampos;
}

/** Visualizador só lê: o banco barra a escrita; a tela não deve oferecê-la. */
export const somenteLeitura = (papel: string | null | undefined): boolean => papel === "viewer";
