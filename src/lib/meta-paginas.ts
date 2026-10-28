/**
 * Quais páginas do Facebook pertencem a uma empresa.
 *
 * O login da Meta devolve TODAS as páginas que a pessoa já liberou ao app, de qualquer cliente:
 * quem cuida de várias contas acumula todas elas, e cada nova conexão as trazia de volta. Gravar
 * o que a Meta devolve foi o que pôs a página da Sossae dentro da conta da Taciane. A empresa só
 * passa a ter uma página quando alguém a escolhe — e uma página só pode ter UMA empresa, porque o
 * webhook de lead chega com o `page_id` e nada mais para saber de quem é.
 */
export interface PaginaDaMeta {
  id: string;
}

export interface PlanoDeSelecao {
  /** Escolhidas que a empresa ainda não tinha. */
  adicionar: string[];
  /** Escolhidas que a empresa já tinha: só renovam o token. */
  manter: string[];
  /** Que a empresa tinha e deixou de escolher. */
  remover: string[];
  /** Escolhidas que a conexão não enxerga na Meta. */
  indisponiveis: string[];
  /** Escolhidas que já pertencem a OUTRA empresa. */
  deOutraEmpresa: string[];
}

export function planejarSelecao(entrada: {
  disponiveis: PaginaDaMeta[];
  daEmpresa: string[];
  deOutrasEmpresas: string[];
  escolhidas: string[];
}): PlanoDeSelecao {
  const visiveis = new Set(entrada.disponiveis.map((p) => p.id));
  const minhas = new Set(entrada.daEmpresa);
  const alheias = new Set(entrada.deOutrasEmpresas);
  const escolhidas = [...new Set(entrada.escolhidas)];

  const indisponiveis = escolhidas.filter((id) => !visiveis.has(id));
  const deOutraEmpresa = escolhidas.filter((id) => visiveis.has(id) && alheias.has(id) && !minhas.has(id));
  const validas = escolhidas.filter((id) => visiveis.has(id) && !deOutraEmpresa.includes(id));

  return {
    adicionar: validas.filter((id) => !minhas.has(id)),
    manter: validas.filter((id) => minhas.has(id)),
    remover: entrada.daEmpresa.filter((id) => !escolhidas.includes(id)),
    indisponiveis,
    deOutraEmpresa,
  };
}
