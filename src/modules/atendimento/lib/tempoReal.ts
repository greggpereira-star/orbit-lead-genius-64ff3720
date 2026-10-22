/**
 * Estado da conexão em tempo real do Atendimento.
 *
 * O tempo real (Supabase Realtime) pode não conectar ou cair sem aviso. Sem este estado a tela só
 * atualizava ao voltar o foco para a aba, e o atraso parecia "normal". Aqui a conexão é visível
 * (indicador e `window.__waTempoReal`) e, enquanto não está ao vivo, as consultas relêem sozinhas.
 */
import { useSyncExternalStore } from "react";

export type EstadoDoTempoReal = "conectando" | "ao_vivo" | "reconectando";

export interface SituacaoDoTempoReal {
  estado: EstadoDoTempoReal;
  /** Último status devolvido pelo canal (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED). */
  ultimoStatus: string | null;
  erro: string | null;
  tentativas: number;
  desde: number;
}

let situacao: SituacaoDoTempoReal = {
  estado: "conectando",
  ultimoStatus: null,
  erro: null,
  tentativas: 0,
  desde: Date.now(),
};
const ouvintes = new Set<() => void>();

function publicar(nova: SituacaoDoTempoReal) {
  situacao = nova;
  if (typeof window !== "undefined") {
    // Leitura de diagnóstico: no console, `__waTempoReal` mostra o que o canal respondeu.
    (window as unknown as { __waTempoReal?: SituacaoDoTempoReal }).__waTempoReal = nova;
  }
  ouvintes.forEach((f) => f());
}

export const tempoReal = {
  ler: () => situacao,
  assinar(f: () => void) {
    ouvintes.add(f);
    return () => {
      ouvintes.delete(f);
    };
  },
  /** Traduz o status do canal e devolve se precisa reconectar. */
  registrar(status: string, erro?: string | null): { reconectar: boolean } {
    if (status === "SUBSCRIBED") {
      publicar({
        estado: "ao_vivo",
        ultimoStatus: status,
        erro: null,
        tentativas: 0,
        desde: Date.now(),
      });
      return { reconectar: false };
    }
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      publicar({
        estado: "reconectando",
        ultimoStatus: status,
        erro: erro ?? null,
        tentativas: situacao.tentativas + 1,
        desde: situacao.estado === "reconectando" ? situacao.desde : Date.now(),
      });
      return { reconectar: true };
    }
    return { reconectar: false };
  },
  reiniciar() {
    publicar({
      estado: "conectando",
      ultimoStatus: null,
      erro: null,
      tentativas: 0,
      desde: Date.now(),
    });
  },
};

export function useSituacaoDoTempoReal(): SituacaoDoTempoReal {
  return useSyncExternalStore(tempoReal.assinar, tempoReal.ler, tempoReal.ler);
}

/** Espera antes de tentar de novo: 2 s, 4 s, 8 s… até 30 s. */
export function esperaDaReconexao(tentativa: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.max(0, tentativa - 1));
}

/**
 * Releitura de segurança. Ao vivo, o tempo real faz o trabalho (e a releitura é só um seguro
 * lento); fora dele, relê a cada poucos segundos para o atraso nunca passar disso.
 */
export function intervaloDeReleitura(estado: EstadoDoTempoReal): number {
  return estado === "ao_vivo" ? 120_000 : 8_000;
}
