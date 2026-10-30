/**
 * Aplica no `settings` do funil os campos editados em Configurações.
 *
 * Texto: vazio remove a chave. `score_tiers` (lista) e `mostrar_assinatura`
 * (booleano) NÃO são texto — chamar `.trim()` neles dava TypeError e o diálogo
 * inteiro falhava ao salvar. Lista vazia remove a chave; `false` também, pois
 * desligado é o padrão.
 */
export function aplicarCampo(settings: Record<string, unknown>, chave: string, valor: unknown): void {
  if (valor === undefined) return;
  if (typeof valor === "string") {
    const t = valor.trim();
    if (t) settings[chave] = t;
    else delete settings[chave];
    return;
  }
  if (Array.isArray(valor)) {
    if (valor.length) settings[chave] = valor;
    else delete settings[chave];
    return;
  }
  if (typeof valor === "boolean") {
    if (valor) settings[chave] = true;
    else delete settings[chave];
    return;
  }
  if (valor === null) {
    delete settings[chave];
    return;
  }
  settings[chave] = valor;
}
