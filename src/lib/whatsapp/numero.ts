/**
 * Número de WhatsApp em forma canônica (só dígitos, com DDI).
 *
 * Mora aqui, e não no cliente de nenhum provedor, porque a regra é do produto:
 * vale igual para Evolution e para a Cloud API.
 *
 * Números do Meta Lead Ads chegam em formatos variados (+55 27 99631-8075,
 * 27996318075, 5527996318075). Retorna `null` quando o número não tem cara de
 * telefone válido — melhor não enviar do que enviar para a pessoa errada.
 */
export function toWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = String(raw).replace(/\D+/g, "");
  if (!digits) return null;

  // Remove zeros de discagem nacional no começo (ex.: 027...)
  digits = digits.replace(/^0+/, "");

  // Sem DDI: assume Brasil quando o tamanho bate com DDD + número.
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }

  // Com DDI brasileiro, aceita 12 (fixo) ou 13 (celular com o 9).
  if (digits.startsWith("55")) {
    const rest = digits.slice(2);
    if (rest.length < 10 || rest.length > 11) return null;
    return digits;
  }

  // Outros países: exige um tamanho plausível de E.164.
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

/**
 * Variações do mesmo celular brasileiro por causa do nono dígito.
 *
 * O WhatsApp costuma reportar 55 + DDD + 8 dígitos para celulares antigos,
 * enquanto o cadastro guarda 55 + DDD + 9 dígitos (ou o contrário). Comparar a
 * string exata deixa o opt-out de fora: a pessoa pediu para parar com um
 * formato e o envio seguinte usa o outro.
 */
export function variantesDoNumero(numero: string): string[] {
  const set = new Set<string>([numero]);
  if (numero.startsWith("55")) {
    const ddd = numero.slice(2, 4);
    const resto = numero.slice(4);
    // Só celular antigo ganhou o 9: fixo tem 8 dígitos começando em 2–5 e NÃO
    // vira celular (3333-4444 não é 9 3333-4444).
    if (resto.length === 8 && /^[6-9]/.test(resto)) set.add(`55${ddd}9${resto}`);
    if (resto.length === 9 && resto.startsWith("9")) set.add(`55${ddd}${resto.slice(1)}`);
  }
  return [...set];
}
