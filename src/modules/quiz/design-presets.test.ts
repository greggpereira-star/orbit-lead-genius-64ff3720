import { describe, it, expect } from "vitest";
import { DESIGN_PRESETS, DEFAULT_DESIGN } from "./design-presets";
import { contrasteWCAG, CONTRASTE_MINIMO } from "./lib/color";

/**
 * Trava de contraste dos presets.
 *
 * Medido no quiz do cliente no ar em 07/10: o texto de apoio saía a 3,76:1 no
 * Rose Luxe e a 2,54:1 no Candy — abaixo do piso de 4,5:1, num parágrafo de
 * 17px que o visitante precisa ler para responder. Uma paleta bonita escolhida
 * a olho vira texto ilegível, e isso só aparece medindo. Este teste existe para
 * que nenhum preset novo entre sem passar pela mesma régua.
 */
describe("contraste dos presets", () => {
  const todos = [{ name: "Padrão", design: DEFAULT_DESIGN }, ...DESIGN_PRESETS];

  for (const preset of todos) {
    const d = preset.design;

    it(`${preset.name}: texto principal sobre o fundo`, () => {
      expect(contrasteWCAG(d.text, d.background)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    });

    it(`${preset.name}: texto de apoio sobre o fundo`, () => {
      expect(contrasteWCAG(d.muted, d.background)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    });

    it(`${preset.name}: apoio não grita mais que o texto principal`, () => {
      // O apoio é subordinado: se ele tem MAIS contraste que o título, a
      // hierarquia está invertida e o olho vai para o lugar errado.
      expect(contrasteWCAG(d.muted, d.background)).toBeLessThanOrEqual(
        contrasteWCAG(d.text, d.background),
      );
    });
  }
});
