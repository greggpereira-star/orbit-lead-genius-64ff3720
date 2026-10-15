/**
 * Neutraliza injeção de fórmula em CSV aberto no Excel/Sheets.
 *
 * Nome, e-mail e respostas chegam de formulários PÚBLICOS: qualquer pessoa
 * pode se cadastrar com nome `=HYPERLINK("http://…","clique")` ou `=cmd|…`, e a
 * fórmula executa quando a equipe abre o arquivo exportado. O padrão da OWASP
 * é prefixar com apóstrofo as células que começam por `=`, `+`, `-`, `@`, TAB
 * ou CR.
 *
 * `+` e `-` ficam intactos quando o valor é número ou telefone de verdade
 * (`+5527999998888`, `-3`): prefixá-los estragaria justamente o dado mais
 * comum da planilha.
 */
export function neutralizarFormula(valor: string): string {
  if (!valor) return valor;
  const c = valor[0];
  if (c === "=" || c === "@" || c === "\t" || c === "\r") return `'${valor}`;
  if (c === "+" || c === "-") {
    return /^[+-]?[\d\s().,-]+$/.test(valor) ? valor : `'${valor}`;
  }
  return valor;
}

/** Célula CSV entre aspas, já neutralizada. */
export function celulaCsv(valor: unknown): string {
  const texto = neutralizarFormula(String(valor ?? ""));
  return `"${texto.replace(/"/g, '""')}"`;
}
