/**
 * Contar VISITANTES, e não eventos.
 *
 * O evento `start` é disparado a cada carregamento da página do quiz. E a
 * sessão sobrevive ao carregamento de propósito: a retomada guarda o
 * `sessionId` junto do progresso para que quem volta continue sendo o MESMO
 * lead, em vez de virar um lead novo.
 *
 * As duas coisas juntas significam que um visitante que volta para terminar o
 * quiz emite um segundo `start` com a mesma sessão. Contando eventos, ele vira
 * dois visitantes — e como a conclusão continua sendo uma, a taxa de conversão
 * cai sem que nada tenha piorado.
 *
 * Medido nesta base em 14/10: 35 eventos `start` para 28 sessões. A taxa saía
 * 8/35 = 22,9% quando a verdade era 8/28 = 28,6%. Um quarto de subestimação,
 * no número que decide se o funil vai ao ar ou volta para a prancheta.
 */

export interface EventoContavel {
  event_type: string;
  session_id?: string | null;
}

/**
 * Quantos visitantes distintos geraram este tipo de evento.
 *
 * Evento SEM sessão conta como um visitante próprio, em vez de ser descartado:
 * `session_id` só passou a ser gravado em 05/10/2026, e jogar fora o histórico
 * anterior faria a métrica despencar numa data em que nada aconteceu — um
 * degrau falso é pior que um número levemente inflado, porque parece sinal.
 */
export function contarVisitantes(eventos: EventoContavel[], tipo: string): number {
  const sessoes = new Set<string>();
  let semSessao = 0;

  for (const e of eventos) {
    if (e.event_type !== tipo) continue;
    const s = e.session_id?.trim();
    if (s) sessoes.add(s);
    else semSessao += 1;
  }

  return sessoes.size + semSessao;
}

/**
 * Taxa de conclusão, em porcentagem.
 *
 * Sem visitante não há taxa: devolver 0 diria "ninguém converteu", e o certo é
 * "ainda não dá para dizer". Quem desenha a tela decide como mostrar o nulo.
 */
export function taxaDeConclusao(visitantes: number, conclusoes: number): number | null {
  if (visitantes <= 0) return null;
  return (conclusoes / visitantes) * 100;
}
