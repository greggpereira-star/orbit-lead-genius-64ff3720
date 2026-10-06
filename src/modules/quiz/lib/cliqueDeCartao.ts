/**
 * O clique neste ponto do cartão deve abrir o item?
 *
 * Cartão clicável é conveniência de mouse, e tem três jeitos conhecidos de
 * irritar quem usa:
 *
 * 1. **Engolir os botões de dentro.** Clicar em "Excluir" não pode abrir o
 *    editor junto. Qualquer clique que nasça num `a` ou `button` é deles.
 * 2. **Navegar ao soltar uma seleção.** Quem arrasta para copiar o nome do
 *    quiz termina com um `click` no cartão — e ia parar no editor sem ter
 *    pedido.
 * 3. **Roubar o clique do meio e o de atalho.** Abrir em nova aba é hábito;
 *    com `onClick` no cartão, `ctrl`/`cmd`/meio precisam continuar com o
 *    navegador.
 */
export function cliqueAbreOCartao(params: {
  alvo: { closest(seletor: string): unknown } | null;
  /** `window.getSelection()?.toString()` no momento do clique. */
  selecao?: string;
  botao?: number;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}): boolean {
  const { alvo, selecao, botao = 0, ctrl, meta, shift } = params;

  if (botao !== 0) return false;
  if (ctrl || meta || shift) return false;
  if (selecao && selecao.trim().length > 0) return false;
  if (!alvo) return false;
  if (alvo.closest('a, button, input, textarea, select, [role="button"]')) return false;

  return true;
}
