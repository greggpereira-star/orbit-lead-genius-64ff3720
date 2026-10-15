import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { paraExibicao, paraMetrico, passoExibido } from "./regua";

const lim = { min: 30, max: 200 };

describe("ida e volta em libras e polegadas", () => {
  it("todo valor de 66 a 441 lb volta a ele mesmo — antes 55% não voltava", () => {
    for (let lb = 66; lb <= 441; lb++) {
      const kg = paraMetrico(lb, "weight", "imperial", { min: 0, max: 999 });
      expect(paraExibicao(kg, "weight", "imperial"), `${lb} lb`).toBe(lb);
    }
  });

  it("todo valor de 39 a 99 pol volta a ele mesmo", () => {
    for (let p = 39; p <= 99; p++) {
      const cm = paraMetrico(p, "height", "imperial", { min: 0, max: 999 });
      expect(paraExibicao(cm, "height", "imperial"), `${p} pol`).toBe(p);
    }
  });

  it("o valor guardado nunca sai dos limites do autor", () => {
    expect(paraMetrico(60, "weight", "imperial", lim)).toBe(30);
    expect(paraMetrico(500, "weight", "imperial", lim)).toBe(200);
  });

  it("em métrico o valor passa direto", () => {
    expect(paraMetrico(75, "weight", "metric", lim)).toBe(75);
    expect(paraExibicao(75, "weight", "metric")).toBe(75);
  });
});

describe("passo configurado pelo autor", () => {
  it("vale em métrico; em imperial o passo é 1", () => {
    expect(passoExibido(5, "metric")).toBe(5);
    expect(passoExibido(5, "imperial")).toBe(1);
    expect(passoExibido(undefined, "metric")).toBe(1);
    expect(passoExibido(0, "metric")).toBe(1);
  });

  it("o player passa o sliderStep à régua (antes era step={1} fixo)", () => {
    const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
    expect(player).toContain("step={passoExibido(block.sliderStep, sliderUnit)}");
    expect(player).not.toMatch(/<RulerSlider[\s\S]{0,200}step=\{1\}/);
  });
});
