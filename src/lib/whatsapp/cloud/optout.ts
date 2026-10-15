/**
 * "SAIR", "parar", "Cancelar inscrição" — o pedido de parada de receber mensagem.
 *
 * Tem de ser a mensagem INTEIRA (com pontuação e um "por favor"). A versão antiga
 * casava só o começo: "cancelar meu pedido", "sair às 18h" e "remover o item"
 * viravam opt-out DEFINITIVO — o lead sumia das automações sem ninguém perceber,
 * e não havia como voltar.
 *
 * A mesma regra existe no gatilho do banco (`wa_disparar_automacao_de_mensagem`),
 * para o pedido de parada não disparar resposta automática. Mexeu aqui, mexa lá.
 */
const PEDIDO_DE_PARADA =
  /^\s*(sair|parar|pare|stop|cancelar|descadastrar|remover)(\s+(por favor|pf))?[\s.!]*$/i;

export function pedeParaParar(texto: string | null | undefined): boolean {
  return !!texto && PEDIDO_DE_PARADA.test(texto);
}
