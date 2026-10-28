/**
 * Trava de recurso por plano. Só servidor.
 *
 * Toda funcionalidade vendida por plano chama `exigirRecurso` ANTES de agir. A
 * conferência vive no servidor porque esconder o botão na tela não protege nada:
 * quem tem a sessão chama a rota direto.
 */
import type { ChaveDeRecurso } from "./planos/recursos";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

export class RecursoIndisponivelError extends Error {
  readonly chave: ChaveDeRecurso;
  constructor(chave: ChaveDeRecurso) {
    super("Este recurso não está disponível no plano atual da empresa.");
    this.name = "RecursoIndisponivelError";
    this.chave = chave;
  }
}

export async function temRecurso(admin: Admin, companyId: string, chave: ChaveDeRecurso): Promise<boolean> {
  const { data, error } = await admin.rpc("tem_recurso", { p_company_id: companyId, p_chave: chave });
  // Falha na consulta NEGA: um erro de banco não pode virar recurso liberado.
  if (error) return false;
  return data === true;
}

export async function exigirRecurso(admin: Admin, companyId: string, chave: ChaveDeRecurso): Promise<void> {
  if (!(await temRecurso(admin, companyId, chave))) throw new RecursoIndisponivelError(chave);
}

/** Limite numérico do recurso (0 se ausente ou se a consulta falhar). */
export async function limiteDoRecurso(admin: Admin, companyId: string, chave: ChaveDeRecurso): Promise<number> {
  const { data, error } = await admin.rpc("valor_do_recurso", { p_company_id: companyId, p_chave: chave });
  if (error || typeof data !== "number") return 0;
  return data;
}
