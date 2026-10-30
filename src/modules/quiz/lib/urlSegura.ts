/**
 * Devolve a URL se for segura para navegar, senão `null`.
 *
 * O autor do quiz digita a URL do botão. `javascript:` e `data:` rodariam código
 * na origem do app ao clicar. Só passam http, https, mailto, tel e caminhos
 * relativos; qualquer outro esquema é recusado.
 */
export function urlSegura(url: string | null | undefined): string | null {
  const u = (url ?? "").trim();
  if (!u) return null;
  // Esquema = letras/dígitos/+.- antes de ":"; espaços e quebras no meio são truque clássico.
  const limpo = u.replace(/[\u0000-\u001f\u007f\s]/g, "");
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(limpo);
  if (!m) return u;
  return ["http", "https", "mailto", "tel"].includes(m[1].toLowerCase()) ? u : null;
}
