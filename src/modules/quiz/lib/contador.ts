/**
 * Lógica do contador regressivo, fora do componente.
 *
 * Está aqui porque o componente tinha um defeito que só se enxerga separando as
 * duas coisas: o instante-alvo era recalculado A CADA RENDER
 *
 *     const target = endsAt ? ... : Date.now() + minutes * 60_000;
 *
 * e o `now` vinha do estado, atualizado a cada segundo. Como as duas chamadas a
 * `Date.now()` aconteciam praticamente juntas, `target - now` dava sempre o
 * mesmo número: **o contador exibia 15 minutos e nunca descia.** Só funcionava
 * quando `countdownEndsAt` estava preenchido, e o bloco da paleta nasce sem ele.
 */

export interface RestanteDoContador {
  horas: number;
  minutos: number;
  segundos: number;
  terminou: boolean;
}

/** O instante em que o contador zera. Calculado UMA vez, na montagem. */
export function alvoDoContador(agora: number, endsAt?: string, minutos = 15): number {
  if (endsAt) {
    const t = new Date(endsAt).getTime();
    // Data inválida vira contagem relativa, em vez de `NaN` na tela.
    if (!Number.isNaN(t)) return t;
  }
  return agora + Math.max(0, minutos) * 60_000;
}

export function restanteDoContador(alvo: number, agora: number): RestanteDoContador {
  const diff = Math.max(0, alvo - agora);
  return {
    horas: Math.floor(diff / 3_600_000),
    minutos: Math.floor((diff % 3_600_000) / 60_000),
    segundos: Math.floor((diff % 60_000) / 1000),
    terminou: diff === 0,
  };
}

/**
 * Já passou o atraso de exibição?
 *
 * É o "Mostrar após" do inlead: o contador só aparece — e só começa a contar —
 * depois de N segundos na etapa. Serve para o cronômetro não competir com a
 * leitura logo na entrada.
 */
export function jaPodeAparecer(montadoEm: number, agora: number, atrasoSegundos = 0): boolean {
  if (atrasoSegundos <= 0) return true;
  return agora - montadoEm >= atrasoSegundos * 1000;
}
