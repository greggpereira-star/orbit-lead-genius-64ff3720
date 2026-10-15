/** Troca `{{n}}` pelos valores. Puro: a tela e o servidor usam o MESMO texto. */
export function renderizarTexto(modelo: string, valores: Record<number, string>): string {
  return modelo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n: string) => valores[Number(n)] ?? "");
}
