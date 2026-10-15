/** "SAIR", "parar", "Cancelar inscrição" — variações que significam "pare". */
const PEDIDO_DE_PARADA = /^\s*(sair|parar|pare|stop|cancelar|descadastrar|remover)\b/i;

export function pedeParaParar(texto: string | null | undefined): boolean {
  return !!texto && PEDIDO_DE_PARADA.test(texto);
}
