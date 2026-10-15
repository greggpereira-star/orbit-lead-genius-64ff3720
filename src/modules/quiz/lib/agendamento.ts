/**
 * Quando o bloco de agendamento deixa o visitante avançar.
 *
 * - Obrigatório: precisa de dia e, se o horário foi pedido, de horário.
 * - Opcional: pode ficar totalmente vazio; mas meia marcação (só o dia quando
 *   o horário é pedido, ou só o horário) não passa — mandar metade de um
 *   agendamento ao vendedor é pior do que não mandar nada.
 */
export interface AgendamentoParcial {
  data?: string;
  hora?: string;
}

export function agendamentoPodeAvancar(
  valor: AgendamentoParcial | undefined,
  opcoes: { required?: boolean; allowTime?: boolean },
): boolean {
  const temData = !!valor?.data;
  const temHora = !!valor?.hora;
  if (!temData && !temHora) return !opcoes.required;
  return temData && (!opcoes.allowTime || temHora);
}
