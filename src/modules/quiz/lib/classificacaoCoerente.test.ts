import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { maxPossibleScore, minPossibleScore, scorePercent, classifyTemperature } from "../engine";
import type { QuizSchema } from "../types";

/**
 * A mesma submissão não pode receber duas classificações.
 *
 * Três lugares calculam o percentual do lead: o servidor, que escolhe a FAIXA
 * e com ela a mensagem de WhatsApp; o `finish` do player, que grava a
 * TEMPERATURA na submissão; e a tela de resultado, que mostra o número ao
 * visitante. O servidor já passava as respostas para o teto e para o piso. Os
 * dois do player não: teto global com piso do visitante — par desencontrado.
 */
const schema = {
  blocks: [
    {
      id: "q1",
      type: "single-choice",
      options: [
        { id: "a", label: "A", score: 10 },
        { id: "b", label: "B", score: 0 },
      ],
    },
    // Só aparece para quem respondeu "b". Quem responde "a" nunca o vê.
    {
      id: "q2",
      type: "single-choice",
      showIf: { enabled: true, fieldBlockId: "q1", op: "eq", value: "b" },
      options: [
        { id: "c", label: "C", score: 90 },
        { id: "d", label: "D", score: 0 },
      ],
    },
  ],
  steps: [
    { id: "s1", blockIds: ["q1"] },
    { id: "s2", blockIds: ["q2"] },
  ],
} as unknown as QuizSchema;

describe("teto do visitante x teto global", () => {
  const respostas = { q1: "a" }; // acertou tudo o que lhe foi perguntado

  it("o teto global inclui o bloco que este visitante nunca viu", () => {
    expect(maxPossibleScore(schema)).toBe(100);
    expect(maxPossibleScore(schema, respostas)).toBe(10);
  });

  it("com o teto global, quem acertou tudo aparece como 10% e cai em `cold`", () => {
    const maxGlobal = maxPossibleScore(schema);
    const minDele = minPossibleScore(schema, respostas);
    expect(Math.round(scorePercent(10, maxGlobal, minDele))).toBe(10);
    expect(classifyTemperature(10, maxGlobal, minDele)).toBe("cold");
  });

  it("com o teto dele, o mesmo lead é 100% e `hot` — como o servidor o classifica", () => {
    const maxDele = maxPossibleScore(schema, respostas);
    const minDele = minPossibleScore(schema, respostas);
    expect(Math.round(scorePercent(10, maxDele, minDele))).toBe(100);
    expect(classifyTemperature(10, maxDele, minDele)).toBe("hot");
  });
});

describe("os três pontos passam as respostas", () => {
  const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
  const servidor = readFileSync("src/routes/api/public/quiz-completed.ts", "utf8");

  it("o servidor usa teto e piso do visitante", () => {
    expect(servidor).toContain("maxPossibleScore(schema as never, respostasDoLead ?? undefined)");
    expect(servidor).toContain("minPossibleScore(schema as never, respostasDoLead ?? undefined)");
  });

  it("nenhuma chamada do player calcula o teto sem as respostas", () => {
    const chamadas = player.match(/maxPossibleScore\([^)]*\)/g) ?? [];
    expect(chamadas.length).toBeGreaterThan(0);
    expect(chamadas.filter((c) => !/,/.test(c))).toEqual([]);
  });

  it("a tela de resultado usa scorePercent, não uma divisão à mão", () => {
    const vista = player.slice(player.indexOf("function ResultView"));
    expect(vista.slice(0, 900)).toContain("scorePercent(");
  });
});
