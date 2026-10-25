/**
 * Confere se um evento de conversão (`Lead`/`CompleteRegistration`) que chegou ao
 * `pixel-event` corresponde a uma captura real no funil.
 *
 * Por ora só OBSERVA: o resultado vai para o log e nada é barrado. Os leads de quiz
 * não guardam o `event_id`, então a correspondência cai para o contato (e-mail ou
 * telefone) quando o id não aparece.
 */

export interface CapturaRecente {
  event_id: string | null;
  email: string | null;
  phone: string | null;
}

export type ResultadoDaConferencia = 'por_event_id' | 'por_contato' | 'sem_captura';

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

export function conferirCaptura(
  evento: { eventId: string; email?: string | null; phone?: string | null },
  capturas: readonly CapturaRecente[],
): ResultadoDaConferencia {
  if (capturas.some((c) => c.event_id && c.event_id === evento.eventId)) return 'por_event_id';

  const email = (evento.email ?? '').trim().toLowerCase();
  const fone = soDigitos(evento.phone);
  const fim = fone.length >= 8 ? fone.slice(-8) : '';

  const bateu = capturas.some(
    (c) =>
      (email !== '' && (c.email ?? '').trim().toLowerCase() === email) ||
      (fim !== '' && soDigitos(c.phone).endsWith(fim)),
  );
  return bateu ? 'por_contato' : 'sem_captura';
}
