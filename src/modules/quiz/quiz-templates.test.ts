import { describe, it, expect } from "vitest";
import { MODELOS_DE_QUIZ } from "./quiz-templates";
import { validarPublicacao } from "./lib/validarPublicacao";
import { getSteps } from "./lib/steps";
import { maxPossibleScore, minPossibleScore } from "./engine";

/**
 * O defeito que estes testes existem para impedir: os seis modelos que estavam
 * na base tinham `blocks: []`. "Usar Template" criava um quiz vazio com nome
 * bonito e nada reclamava — nem a compilação, nem a publicação, porque ninguém
 * chamava o validador em cima deles.
 */
describe("modelos de quiz", () => {
  it("não está vazio", () => {
    expect(MODELOS_DE_QUIZ.length).toBeGreaterThanOrEqual(6);
  });

  it("usa slugs únicos", () => {
    const slugs = MODELOS_DE_QUIZ.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  describe.each(MODELOS_DE_QUIZ.map((m) => [m.slug, m] as const))("%s", (_slug, modelo) => {
    const schema = modelo.build();

    it("passa na validação de publicação sem bloqueios", () => {
      const bloqueios = validarPublicacao(schema).filter((a) => a.nivel === "bloqueia");
      expect(bloqueios).toEqual([]);
    });

    it("tem etapas e blocos de verdade", () => {
      expect(schema.blocks.length).toBeGreaterThanOrEqual(6);
      expect(getSteps(schema, { keepEmpty: true }).length).toBe(schema.blocks.length);
    });

    it("nomeia todas as etapas", () => {
      for (const s of getSteps(schema, { keepEmpty: true })) {
        expect(s.name, `etapa ${s.id} sem nome`).toBeTruthy();
      }
    });

    it("usa ids únicos de bloco e de opção", () => {
      const ids = schema.blocks.flatMap((b) => [b.id, ...(b.options ?? []).map((o) => o.id)]);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("pontua — dá para separar lead quente de frio", () => {
      const max = maxPossibleScore(schema);
      const min = minPossibleScore(schema);
      expect(max).toBeGreaterThan(0);
      // Faixa estreita não distingue ninguém; é o que o quiz existe para fazer.
      expect(max - min).toBeGreaterThanOrEqual(20);
    });

    it("captura contato antes do fim, e não na primeira etapa", () => {
      const tipos = schema.blocks.map((b) => b.type);
      const iCaptura = tipos.indexOf("form");
      expect(iCaptura).toBeGreaterThan(0);
      expect(iCaptura).toBeLessThan(tipos.length);
    });

    it("abre com intro e fecha com resultado", () => {
      expect(schema.blocks[0].type).toBe("intro");
      expect(schema.blocks[schema.blocks.length - 1].type).toBe("result");
    });

    it("escreve o texto do resultado no campo que o player lê", () => {
      // `resultDescription` foi o nome errado na primeira versão: o cast
      // `as QuizBlock` aceitou, e a tela de resultado sairia sem texto.
      const res = schema.blocks.find((b) => b.type === "result");
      expect(res?.resultTitle).toBeTruthy();
      expect(res?.resultBody).toBeTruthy();
    });

    it("não deixa pergunta sem opção", () => {
      for (const b of schema.blocks.filter((b) => b.type === "single-choice")) {
        expect((b.options ?? []).length, `bloco ${b.id}`).toBeGreaterThanOrEqual(2);
      }
    });
  });
});
