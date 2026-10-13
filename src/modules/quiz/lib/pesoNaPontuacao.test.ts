import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { evaluateResponse, maxPossibleScore, minPossibleScore, scorePercent } from "../engine";
import type { QuizBlock, QuizSchema } from "../types";

/**
 * Peso por pergunta: o motor sempre soube, e não havia onde escrever o número.
 *
 * `evaluateResponse` lê `block.scoreWeight ?? 1` desde que a pontuação existe,
 * e `maxPossibleScore`/`minPossibleScore` aplicam o mesmo peso ao teto e ao
 * piso. Mas nenhuma tela gravava o campo — só editando o schema à mão. Ficou
 * anos sem interface E sem teste, que é como um recurso vira lenda: ninguém
 * sabe se funciona, então ninguém usa, então ninguém descobre que quebrou.
 *
 * Estes testes exercitam o motor, não leem código. É o que me autoriza a expor
 * o campo na interface.
 */
const escolha = (id: string, scores: number[], peso?: number): QuizBlock =>
  ({
    id,
    type: "single-choice",
    scoreWeight: peso,
    options: scores.map((s, i) => ({ id: `${id}-o${i}`, label: `o${i}`, score: s })),
  }) as unknown as QuizBlock;

describe("o peso multiplica o que a resposta vale", () => {
  it("sem peso, vale o score da opção", () => {
    const b = escolha("a", [10, 0]);
    expect(evaluateResponse(b, "a-o0").scoreDelta).toBe(10);
  });

  it("peso 2 dobra", () => {
    expect(evaluateResponse(escolha("a", [10, 0], 2), "a-o0").scoreDelta).toBe(20);
  });

  it("peso 0,5 reduz à metade — por isso o passo da interface é 0,5", () => {
    expect(evaluateResponse(escolha("a", [10, 0], 0.5), "a-o0").scoreDelta).toBe(5);
  });

  it("peso 0 tira a pergunta da conta sem apagá-la", () => {
    expect(evaluateResponse(escolha("a", [10, 0], 0), "a-o0").scoreDelta).toBe(0);
  });
});

describe("o teto e o piso acompanham o peso", () => {
  /* É isto que mantém a porcentagem comparável. Se o peso entrasse só no que o
     visitante ganha e não no máximo alcançável, pesar uma pergunta inflaria a
     nota de todo mundo — e a classificação do lead passaria a depender de uma
     escolha de montagem, não da resposta. */
  const schema = (peso?: number): QuizSchema =>
    ({
      blocks: [escolha("a", [10, 0], peso), escolha("b", [10, 0])],
      steps: [],
    }) as unknown as QuizSchema;

  it("sem peso: teto é a soma dos melhores", () => {
    expect(maxPossibleScore(schema())).toBe(20);
  });

  it("com peso 3 na primeira, o teto sobe junto", () => {
    expect(maxPossibleScore(schema(3))).toBe(40);
  });

  it("quem gabarita dá 100% com ou sem peso", () => {
    for (const peso of [undefined, 0.5, 2, 3]) {
      const s = schema(peso);
      const ganho =
        evaluateResponse(s.blocks[0], "a-o0").scoreDelta +
        evaluateResponse(s.blocks[1], "b-o0").scoreDelta;
      const pct = scorePercent(ganho, maxPossibleScore(s), minPossibleScore(s));
      expect(pct, `peso ${peso}`).toBe(100);
    }
  });

  it("pesar uma pergunta muda o percentual de quem acerta só a outra", () => {
    // O ponto do recurso: com a primeira valendo o triplo, acertar só a
    // segunda deixa de ser "metade da nota".
    const semPeso = schema();
    const comPeso = schema(3);
    const soASegunda = (s: QuizSchema) =>
      scorePercent(
        evaluateResponse(s.blocks[1], "b-o0").scoreDelta,
        maxPossibleScore(s),
        minPossibleScore(s),
      );
    expect(soASegunda(semPeso)).toBe(50);
    expect(soASegunda(comPeso)).toBe(25);
  });

  it("o piso também é pesado, com opção negativa", () => {
    const comNegativa = (peso?: number): QuizSchema =>
      ({ blocks: [escolha("a", [10, -4], peso)], steps: [] }) as unknown as QuizSchema;
    expect(minPossibleScore(comNegativa())).toBe(-4);
    expect(minPossibleScore(comNegativa(2))).toBe(-8);
  });
});

describe("a interface oferece peso exatamente onde o motor pesa", () => {
  const inspetor = readFileSync("src/modules/quiz/components/QuizInspector.tsx", "utf8");
  const motor = readFileSync("src/modules/quiz/engine.ts", "utf8");

  /* Até o `]` do próprio Set, não 200 caracteres: a primeira versão fatiava por
     tamanho fixo e varria para dentro do código seguinte, trazendo tipos que
     não estavam na lista — e acusando um defeito que não existia. */
  const entre = (fonte: string, inicio: string, fim: string): string => {
    const i = fonte.indexOf(inicio);
    if (i < 0) throw new Error(`não achei "${inicio}"`);
    const j = fonte.indexOf(fim, i + inicio.length);
    if (j < 0) throw new Error(`não achei o fim de "${inicio}"`);
    return fonte.slice(i, j);
  };

  const oferecidos = new Set(
    [...entre(inspetor, "const PESA_NA_PONTUACAO = new Set([", "]").matchAll(/"([a-z-]+)"/g)].map(
      (m) => m[1],
    ),
  );

  /* Os ramos de `maxPossibleScore` SÃO a definição de quais tipos somam
     pontuação. O fim é o próximo `export`, e não `classifyTemperature`: essa
     função vem ANTES no arquivo, e mirar nela devolvia fatia vazia — o teste
     acusaria zero tipos pontuados e eu teria "consertado" o lugar errado. */
  const tipoPontuado = (): Set<string> => {
    const teto = entre(motor, "export function maxPossibleScore", "\nexport ");
    return new Set([...teto.matchAll(/b\.type === '([a-z-]+)'/g)].map((m) => m[1]));
  };

  it("a varredura achou as duas listas", () => {
    expect(oferecidos.size).toBeGreaterThanOrEqual(3);
    expect(tipoPontuado().size).toBeGreaterThanOrEqual(3);
  });

  it("todo tipo que o motor pontua tem campo de peso", () => {
    for (const tipo of tipoPontuado()) {
      expect(oferecidos.has(tipo), `${tipo} pontua no motor mas não tem campo de peso`).toBe(true);
    }
  });

  it("nada é oferecido fora do que o motor pontua — campo sem efeito é mentira", () => {
    const pontuados = tipoPontuado();
    const sobrando = [...oferecidos].filter((t) => !pontuados.has(t));
    expect(sobrando, `oferecidos sem efeito: ${sobrando.join(", ")}`).toEqual([]);
  });

  it("a seção é governada por essa lista, e não por outra condição", () => {
    // Sem isto, a lista poderia estar certa e a seção aparecer em todo bloco:
    // o teste estaria conferindo um conjunto que não manda em nada.
    expect(inspetor).toContain("PESA_NA_PONTUACAO.has(block.type) && (");
    expect(inspetor).toContain('<Section title="Peso na pontuação"');
  });

  it("o peso 1 não é gravado — é o que `?? 1` já significa", () => {
    expect(inspetor).toContain("scoreWeight: n === 1 ? undefined : n");
  });
});
