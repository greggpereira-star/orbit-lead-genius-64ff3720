/**
 * Nome da instância da Evolution de uma empresa — determinístico.
 *
 * O servidor da Evolution usa UMA chave para todas as empresas: quem consegue
 * fazer o app chamar `delete`/`sendText` com o NOME de uma instância age sobre
 * ela. Por isso o nome nunca é aceito do banco "como veio": é recomputado a
 * partir da empresa e comparado. (O banco era gravável por qualquer membro até a
 * migração `endurecer_acessos`.)
 */
export function instanceNameFor(companyId: string): string {
  return `altflow_${companyId.replace(/-/g, "").slice(0, 20)}`;
}

/** O nome guardado pertence mesmo a esta empresa? */
export function nomeDaInstanciaConfere(
  companyId: string,
  nomeGuardado: string | null | undefined,
): boolean {
  return !!nomeGuardado && nomeGuardado === instanceNameFor(companyId);
}
