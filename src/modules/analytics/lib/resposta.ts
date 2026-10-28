import { AMOSTRA_MINIMA } from "./anuncios";

/**
 * Leitura do tempo de primeira resposta.
 *
 * Só dá para medir o lead que tem conversa no WhatsApp ligada a ele OU contato registrado à
 * mão (botão "Registrar contato"). Por isso a COBERTURA vem junto de qualquer mediana:
 * "respondemos em 2 min" dito sobre 1 lead de 179 não é um resultado da operação, é uma anedota.
 */
export interface RespostaBruta {
  leads_total: number;
  com_conversa: number;
  respondidos: number;
  mediana_segundos: number | null;
  p90_segundos: number | null;
  ate_5min: number;
  ate_1h: number;
  ate_24h: number;
  so_automacao: number;
  sem_resposta: number;
  esperando_agora: number;
  espera_mais_antiga_segundos: number | null;
  /** Leads com conversa OU com contato registrado: a base de cobertura. */
  medidos: number;
  com_contato_registrado: number;
  /** Dos respondidos, quantos foram medidos pelo contato registrado (veio antes da resposta no WhatsApp). */
  respondidos_manual: number;
  /** Dos medidos pelo registro, quantos tiveram horário informado à mão (registrado >5 min depois). */
  respondidos_retroativos: number;
}

export interface AnaliseDeResposta {
  leadsTotal: number;
  comConversa: number;
  /** Leads com conversa ou com contato registrado: só esses podem ser medidos. */
  medidos: number;
  comContatoRegistrado: number;
  respondidosManual: number;
  respondidosRetroativos: number;
  /** Fração 0–1 dos leads do período que podem ser medidos. `null` sem lead. */
  cobertura: number | null;
  respondidos: number;
  medianaSegundos: number | null;
  p90Segundos: number | null;
  /** Quantos dos respondidos ficaram dentro de cada prazo. */
  prazos: { rotulo: string; quantidade: number }[];
  semResposta: number;
  soAutomacao: number;
  esperandoAgora: number;
  esperaMaisAntigaSegundos: number | null;
  /** Poucos respondidos: mediana e percentis balançam. Mesma régua da tabela de anúncios. */
  amostraPequena: boolean;
  /** Menos da metade dos leads pode ser medida: o número não descreve a operação toda. */
  coberturaBaixa: boolean;
}

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v) || 0);
const talvez = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function analisarResposta(b: RespostaBruta): AnaliseDeResposta {
  const leadsTotal = n(b.leads_total);
  const comConversa = n(b.com_conversa);
  const medidos = n(b.medidos);
  const cobertura = leadsTotal > 0 ? medidos / leadsTotal : null;
  const respondidos = n(b.respondidos);
  return {
    leadsTotal,
    comConversa,
    medidos,
    comContatoRegistrado: n(b.com_contato_registrado),
    respondidosManual: n(b.respondidos_manual),
    respondidosRetroativos: n(b.respondidos_retroativos),
    cobertura,
    respondidos,
    medianaSegundos: talvez(b.mediana_segundos),
    p90Segundos: talvez(b.p90_segundos),
    prazos: [
      { rotulo: "até 5 min", quantidade: n(b.ate_5min) },
      { rotulo: "até 1 h", quantidade: n(b.ate_1h) },
      { rotulo: "até 24 h", quantidade: n(b.ate_24h) },
    ],
    semResposta: n(b.sem_resposta),
    soAutomacao: n(b.so_automacao),
    esperandoAgora: n(b.esperando_agora),
    esperaMaisAntigaSegundos: talvez(b.espera_mais_antiga_segundos),
    amostraPequena: respondidos < AMOSTRA_MINIMA,
    coberturaBaixa: cobertura !== null && cobertura < 0.5,
  };
}

/** "45 s", "12 min", "3 h 20 min", "6 dias": a unidade que a pessoa usaria falando. */
export function formatarDuracao(segundos: number | null): string {
  if (segundos === null || !Number.isFinite(segundos) || segundos < 0) return "—";
  const s = Math.round(segundos);
  if (s < 60) return `${s} s`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 48) {
    const resto = min % 60;
    return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
  }
  return `${Math.round(s / 86400)} dias`;
}

export const percentual = (parte: number, total: number): string =>
  total > 0
    ? `${((parte / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`
    : "—";
