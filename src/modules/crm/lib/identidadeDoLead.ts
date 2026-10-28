/**
 * Quando dois leads são a mesma pessoa.
 *
 * Medido na base em 13/10: 560 leads, 28 linhas excedentes por e-mail repetido
 * — 5% do CRM é a mesma pessoa contada duas ou três vezes. A causa é que o
 * único critério existente era `quiz_id` + `session_id`: quem responde de
 * novo, ou responde outro quiz, vira lead novo.
 *
 * Duplicata não é só ruído de contagem. É o vendedor ligando para quem outro
 * vendedor já ligou, e é a mesma pessoa recebendo a mesma automação duas vezes.
 */

/** E-mail comparável: caixa baixa e sem espaço. Vazio vira `null`. */
export function normalizarEmail(bruto: string | null | undefined): string | null {
  const limpo = (bruto ?? "").trim().toLowerCase();
  return limpo || null;
}

/**
 * Telefone comparável.
 *
 * Só dígitos NÃO basta no Brasil: "11 99999-8888", "+55 11 99999-8888" e
 * "011 99999 8888" são o mesmo telefone e dão três cadeias diferentes.
 *
 * "Ficar com os últimos 11" também não basta, e foi o que escrevi primeiro: um
 * FIXO com código de país tem 12 dígitos (55 + 11 + 8), e cortar em 11 deixava
 * o "5" do país colado no DDD — "+55 11 3333-4444" virava "51133334444" e
 * deixava de casar com "(11) 3333-4444". O teste pegou.
 *
 * A regra certa segue a ESTRUTURA do número: tira zero de operadora, tira o
 * 55 do país só quando sobra um número plausível, e aceita 10 dígitos (fixo)
 * ou 11 (celular com nono dígito).
 *
 * Fora dessa faixa devolve `null`, e `null` nunca casa com nada: na dúvida o
 * produto fica com dois leads, que dá para juntar depois. Juntar duas pessoas
 * diferentes perde o contato de uma e não tem desfazer.
 */
export function normalizarTelefone(bruto: string | null | undefined): string | null {
  let d = (bruto ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2).replace(/^0+/, "");
  return d.length === 10 || d.length === 11 ? d : null;
}

/**
 * Os últimos 8 dígitos, para buscar candidatos no banco.
 *
 * O banco guarda o telefone como foi digitado, com máscara e tudo. Procurar
 * pela forma normalizada não acharia nada; procurar pelo fim do número acha, e
 * a confirmação fica para `mesmaPessoa`, que compara já normalizado. Oito
 * dígitos é o que não muda entre as formas (sem DDD, sem país, com ou sem o
 * nono dígito).
 */
export function finalDoTelefone(bruto: string | null | undefined): string | null {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  return digitos.length >= 8 ? digitos.slice(-8) : null;
}

/**
 * Padrão `like` que acha o telefone guardado COMO FOI DIGITADO.
 *
 * `%<8 dígitos>%` falha quando a máscara cai no meio deles: "(27) 99999-0011"
 * não contém "99990011". Medido em produção em 28/10/2026: 6 de 643 leads.
 * Aqui cada dígito vira `%d`, então hífen, espaço e parêntese no meio não
 * atrapalham. A busca fica larga de propósito; quem chama confirma com
 * `mesmaPessoa`, que compara normalizado.
 */
export function padraoDeBuscaDoFim(bruto: string | null | undefined): string | null {
  const fim = finalDoTelefone(bruto);
  return fim ? `%${fim.split("").join("%")}` : null;
}

export interface IdentidadeDeLead {
  email?: string | null;
  phone?: string | null;
}

/**
 * Mesma pessoa quando o e-mail bate OU o telefone bate.
 *
 * "Ou", e não "e": exigir os dois juntos deixaria passar quem preencheu só o
 * telefone de um lado e só o e-mail do outro — que é justamente o caso comum
 * de quem respondeu dois quizzes diferentes. Campo vazio nunca casa com nada.
 */
export function mesmaPessoa(a: IdentidadeDeLead, b: IdentidadeDeLead): boolean {
  const emailA = normalizarEmail(a.email);
  const emailB = normalizarEmail(b.email);
  if (emailA && emailB && emailA === emailB) return true;

  const foneA = normalizarTelefone(a.phone);
  const foneB = normalizarTelefone(b.phone);
  return !!foneA && !!foneB && foneA === foneB;
}

/** O primeiro existente que é a mesma pessoa, se houver. */
export function acharDuplicado<T extends IdentidadeDeLead>(
  novo: IdentidadeDeLead,
  existentes: T[],
): T | null {
  return existentes.find((e) => mesmaPessoa(novo, e)) ?? null;
}
