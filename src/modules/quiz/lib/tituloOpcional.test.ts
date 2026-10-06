import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * O canvas põe "(sem título)" quando o bloco não tem título — é um recado de
 * edição, para o autor ver que há um slot vazio. O PLAYER não põe nada.
 *
 * Isso é correto onde o título é esperado, e errado onde ele é opcional: o
 * construtor mostraria um texto que o quiz publicado não mostra. Já aconteceu
 * três vezes nesta tela, sempre do mesmo jeito, então o teste olha o código.
 */
const canvas = readFileSync("src/modules/quiz/components/QuizPreview.tsx", "utf8");

describe("título opcional não pode inventar texto no canvas", () => {
  it("o canvas mantém a variável crua, sem o recado de edição", () => {
    expect(canvas).toMatch(/const tituloCru = block\.title;/);
  });

  it("o Alerta usa o título cru, e não o que tem o recado embutido", () => {
    const caso = canvas.slice(canvas.indexOf('case "alert"'), canvas.indexOf('case "paragraph"'));
    expect(caso, "o Alerta voltou a usar `title`, que nunca é vazio").not.toMatch(
      /fallback=\{title\}/,
    );
    expect(caso).toMatch(/fallback=\{tituloCru\}/);
  });

  it("o recado continua existindo para os blocos que esperam título", () => {
    // Não é para apagar o "(sem título)" — ele é útil onde o slot é obrigatório.
    expect(canvas).toContain('"(sem título)"');
  });
});
