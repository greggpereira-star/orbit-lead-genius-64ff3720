import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A régua de peso/altura começa SEM resposta e responder é obrigatório.
 * Antes vinha com 70 kg / 170 cm e o botão liberava sem toque: quem só clicava
 * em Continuar gravava um peso inventado como dado do lead.
 */
const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");

describe("régua sem resposta pré-preenchida", () => {
  it("o estado inicial não inventa 70/170", () => {
    expect(player).not.toContain("return block.sliderDefaultValue ?? 70;");
    expect(player).not.toContain("return block.sliderDefaultValue ?? 170;");
  });

  it("sem toque, o botão não libera", () => {
    expect(player).toContain(
      "if (block.type === 'weight' || block.type === 'height') return typeof value === 'number';",
    );
  });

  it("o valor mostrado é um traço até responder", () => {
    expect(player).toContain("{respondido ? displayValue : '—'}");
  });

  it("tocar ou usar as setas conta como resposta; Tab não", () => {
    expect(player).toContain("onTocar?.();\n    dragRef.current");
    expect(player).toContain("if (e.key.startsWith('Arrow')) onTocar?.();");
  });

  it("o toque grava a posição visível, sem exigir arrastar", () => {
    expect(player).toContain("if (!respondido) setValue(metricValue);");
  });
});
