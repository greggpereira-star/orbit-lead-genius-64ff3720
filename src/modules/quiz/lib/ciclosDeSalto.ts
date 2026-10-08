import type { QuizBlock, QuizStep } from "../types";

export interface SaltoDeEtapa {
  /** Índice da etapa de onde o salto parte (0-based). */
  de: number;
  /** Índice da etapa para onde o salto vai (0-based). */
  para: number;
}

/**
 * Todos os saltos do quiz, traduzidos de bloco para ETAPA.
 *
 * As duas origens contam: a opção de uma escolha (`options[].jumpToBlockId`) e
 * a regra de lógica (`logicRules[].jumpToBlockId`). As duas gravam o id de um
 * BLOCO; quem navega é a etapa, então é nela que o laço se fecha.
 */
export function saltosEntreEtapas(steps: QuizStep[], blocos: QuizBlock[]): SaltoDeEtapa[] {
  const etapaDoBloco = new Map<string, number>();
  steps.forEach((s, i) => s.blockIds.forEach((id) => etapaDoBloco.set(id, i)));

  const saltos: SaltoDeEtapa[] = [];
  for (const b of blocos) {
    const de = etapaDoBloco.get(b.id);
    if (de === undefined) continue;
    const destinos = [
      ...(b.options ?? []).map((o) => o.jumpToBlockId),
      ...(b.logicRules ?? []).map((r) => r.jumpToBlockId),
    ];
    for (const alvo of destinos) {
      if (!alvo) continue;
      const para = etapaDoBloco.get(alvo);
      if (para === undefined) continue; // salto quebrado — outra checagem cuida
      saltos.push({ de, para });
    }
  }
  return saltos;
}

/**
 * Saltos que levam o visitante para trás (ou para a própria etapa).
 *
 * Não é erro por si: "volte e corrija" é um uso legítimo. Vira risco quando o
 * caminho de volta não tem saída — e é por isso que isto só avisa.
 */
export function saltosParaTras(saltos: SaltoDeEtapa[]): SaltoDeEtapa[] {
  return saltos.filter((s) => s.para <= s.de);
}

/**
 * Etapas que participam de um laço fechado só por saltos.
 *
 * Seguindo apenas as setas de salto, dá para sair de uma etapa e voltar a ela?
 * Se dá, existe um conjunto de respostas que prende o visitante ali para
 * sempre: ele responde, salta, responde, salta, e nunca chega ao fim. Num
 * funil de captação isso não é um incômodo — é perda total daquele visitante.
 *
 * Só o grafo de SALTOS entra. A aresta natural "etapa N → N+1" sempre existe
 * para quem não dispara nenhum salto, e incluí-la acusaria laço em todo quiz
 * que tem um salto para trás, inclusive nos legítimos.
 *
 * Devolve os índices das etapas envolvidas, em ordem crescente.
 */
export function etapasEmCiclo(saltos: SaltoDeEtapa[]): number[] {
  const vizinhos = new Map<number, number[]>();
  for (const s of saltos) {
    vizinhos.set(s.de, [...(vizinhos.get(s.de) ?? []), s.para]);
  }

  const emCiclo = new Set<number>();
  const BRANCO = 0;
  const CINZA = 1;
  const PRETO = 2;
  const cor = new Map<number, number>();
  const pilha: number[] = [];

  const visitar = (n: number) => {
    cor.set(n, CINZA);
    pilha.push(n);
    for (const v of vizinhos.get(n) ?? []) {
      const c = cor.get(v) ?? BRANCO;
      if (c === CINZA) {
        // Fechou o laço: tudo da pilha a partir de `v` faz parte dele.
        const i = pilha.indexOf(v);
        if (i >= 0) pilha.slice(i).forEach((x) => emCiclo.add(x));
      } else if (c === BRANCO) {
        visitar(v);
      }
    }
    pilha.pop();
    cor.set(n, PRETO);
  };

  for (const n of vizinhos.keys()) {
    if ((cor.get(n) ?? BRANCO) === BRANCO) visitar(n);
  }
  return [...emCiclo].sort((a, b) => a - b);
}

/** "Etapa 2" / "Etapas 2, 5 e 7" — para a mensagem ficar legível. */
export function listarEtapas(indices: number[]): string {
  const nums = indices.map((i) => i + 1);
  if (nums.length === 1) return `Etapa ${nums[0]}`;
  const ultimo = nums[nums.length - 1];
  return `Etapas ${nums.slice(0, -1).join(", ")} e ${ultimo}`;
}
