export type EstiloDeAudio = "padrao" | "instagram" | "escuro";

export const ESTILOS_DE_AUDIO: { valor: EstiloDeAudio; rotulo: string; ajuda: string }[] = [
  { valor: "padrao", rotulo: "Padrão", ajuda: "Cartão claro com o nome de quem fala" },
  { valor: "instagram", rotulo: "Mensagem de voz", ajuda: "Balão com foto e onda, como no direct" },
  { valor: "escuro", rotulo: "Escuro", ajuda: "Mesmo cartão, em fundo escuro" },
];

/** `0:07`, `1:05`, `12:30`. Devolve `0:00` para valor ausente ou inválido. */
export function formatarTempo(segundos: number | undefined): string {
  if (segundos === undefined || !Number.isFinite(segundos) || segundos < 0) return "0:00";
  const total = Math.floor(segundos);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Alturas das barrinhas da onda, de 0.25 a 1.
 *
 * **Isto é enfeite, não a forma de onda real.** Ler a amplitude exigiria baixar
 * e decodificar o arquivo inteiro antes de desenhar — custo que não se paga num
 * funil, onde o áudio costuma nem ser tocado. O que importa para o visitante é
 * reconhecer "isto é uma mensagem de voz", e isso o formato já entrega.
 *
 * O desenho é DETERMINÍSTICO a partir da url: o mesmo áudio tem sempre a mesma
 * onda, entre recarregamentos e entre o construtor e o publicado. Com
 * `Math.random()` a onda mudaria a cada render e pareceria defeito.
 */
export function barrasDaOnda(semente: string, quantidade = 28): number[] {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) {
    h ^= semente.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const barras: number[] = [];
  for (let i = 0; i < quantidade; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const n = Math.abs(h % 1000) / 1000;
    barras.push(0.25 + n * 0.75);
  }
  return barras;
}

/** Quantas barras já foram tocadas, para colorir só essas. */
export function barrasTocadas(total: number, progresso: number): number {
  if (!Number.isFinite(progresso) || progresso <= 0) return 0;
  return Math.min(total, Math.round(total * Math.min(1, progresso)));
}
