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

/**
 * O contrário: o cliente que pediu para parar escreve, sozinho, que quer voltar. Também só vale
 * a mensagem INTEIRA ("voltar", "START", "quero receber"), pelo mesmo motivo do pedido de parada:
 * uma frase comum com a palavra no meio não pode mexer em consentimento.
 */
const PEDIDO_DE_VOLTA =
  /^\s*(voltar|volto|reativar|reativa|retomar|start|iniciar|desbloquear|quero\s+(voltar\s+a\s+)?receber)(\s+(por favor|pf))?[\s.!]*$/i;

export function pedeParaVoltar(texto: string | null | undefined): boolean {
  return !!texto && PEDIDO_DE_VOLTA.test(texto);
}
