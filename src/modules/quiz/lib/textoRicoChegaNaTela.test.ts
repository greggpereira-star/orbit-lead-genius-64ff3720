import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * Editor de texto rico que o visitante nunca vê é pior que não ter editor.
 *
 * O inspetor grava o documento formatado num campo `*Rich` e, ao lado, a
 * versão em texto puro no campo irmão. Se o renderizador lê só o irmão, nada
 * quebra e nada avisa: o autor aplica negrito, link ou lista, salva, e a
 * formatação simplesmente não chega — some entre o que ele escreveu e o que o
 * lead recebe.
 *
 * Foi o caso de `resultBodyRich` até 13/10. `titleRich` e `subtitleRich` eram
 * desenhados nos dois renderizadores desde sempre; só o corpo do resultado
 * ficou de fora, e logo na tela onde o funil entrega o que prometeu.
 */
const inspetor = readFileSync("src/modules/quiz/components/QuizInspector.tsx", "utf8");
const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
const canvas = readFileSync("src/modules/quiz/components/QuizPreview.tsx", "utf8");

/** Campos `*Rich` que o inspetor realmente GRAVA (dentro de um `onChange`). */
const gravadosPeloInspetor = [
  ...new Set([...inspetor.matchAll(/onChange\(\{[^}]*?\b([a-zA-Z]+Rich)\s*:/g)].map((m) => m[1])),
].sort();

describe("texto rico chega na tela", () => {
  it("a varredura achou os campos — senão não está olhando nada", () => {
    // Um `onChange` reescrito devolveria lista vazia, e os testes abaixo
    // passariam sem verificar campo algum.
    expect(gravadosPeloInspetor.length).toBeGreaterThanOrEqual(3);
    expect(gravadosPeloInspetor).toContain("resultBodyRich");
  });

  for (const campo of gravadosPeloInspetor) {
    it(`${campo}: o player desenha`, () => {
      expect(player, `${campo} gravado e não desenhado no player`).toContain(campo);
    });

    it(`${campo}: a prévia desenha`, () => {
      expect(canvas, `${campo} gravado e não desenhado na prévia`).toContain(campo);
    });
  }

  it("o corpo do resultado passa pelo RichText, não por texto puro", () => {
    // Guarda específico: a menção ao campo poderia existir num comentário.
    // Isto exige o uso real, com o irmão em texto puro como reserva.
    for (const [nome, fonte] of [
      ["player", player],
      ["prévia", canvas],
    ] as const) {
      const i = fonte.indexOf("doc={resultBlock?.resultBodyRich}");
      const j = fonte.indexOf("doc={block.resultBodyRich}");
      expect(Math.max(i, j), `${nome} não passa resultBodyRich para o RichText`).toBeGreaterThan(
        -1,
      );
      const trecho = fonte.slice(Math.max(i, j), Math.max(i, j) + 220);
      expect(trecho, `${nome} sem reserva em texto puro`).toContain("resultBody");
    }
  });
});
