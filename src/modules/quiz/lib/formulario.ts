import { validarEmail } from "./email";
import { validarTelefone } from "./telefone";

/**
 * Quando o bloco Formulário deixa a pessoa avançar.
 *
 * Estas regras viviam espalhadas dentro do `canSubmit` do player, uma por
 * versão: o e-mail "não vazio", depois o telefone com formato, depois o
 * formato do e-mail. Fora do componente elas podem ser EXECUTADAS por teste —
 * dentro, o que se conseguia era conferir que um texto existia, e foi assim que
 * um guarda de fachada passou por verdadeiro nesta mesma entrega.
 */

export interface CamposDoFormulario {
  name?: boolean;
  email?: boolean;
  phone?: boolean;
  /**
   * Telefone obrigatório.
   *
   * O padrão é `false` e é de propósito: nos quizzes já publicados o campo
   * nunca foi gravado, e `undefined` precisa continuar significando
   * "opcional", como sempre se comportou. Trocar o padrão tornaria
   * obrigatório o telefone de todo funil no ar.
   */
  phoneRequired?: boolean;
}

export interface ValoresDoFormulario {
  name: string;
  email: string;
  phone: string;
}

export const CAMPOS_PADRAO: CamposDoFormulario = { name: true, email: true, phone: true };

/**
 * `true` quando o formulário pode ser enviado.
 *
 * - e-mail: obrigatório se aparece, e tem que ser e-mail;
 * - telefone: obrigatório só se o autor marcou; preenchido, tem que servir;
 * - campo escondido nunca bloqueia. `phoneRequired` ficado de uma edição
 *   anterior, com o telefone desligado, não pode travar o visitante diante de
 *   um campo que ele nem vê.
 */
export function formularioPodeAvancar(
  campos: CamposDoFormulario | undefined,
  v: ValoresDoFormulario,
): boolean {
  const ff = campos ?? CAMPOS_PADRAO;
  const email = v.email.trim();
  const fone = v.phone.trim();

  if (ff.phone && ff.phoneRequired === true && !fone) return false;
  if (ff.phone && fone && validarTelefone(fone) !== null) return false;
  if (ff.email && email && validarEmail(email) !== null) return false;

  return !ff.email || email.length > 0;
}

/** Texto do campo: o obrigatório se anuncia, senão a pessoa só descobre ao tentar enviar. */
export function placeholderDoTelefone(campos: CamposDoFormulario | undefined): string {
  return campos?.phoneRequired === true ? "Telefone (obrigatório)" : "Telefone";
}
