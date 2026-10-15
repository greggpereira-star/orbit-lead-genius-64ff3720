import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Enter avançava nada: os campos de texto não eram um <form> e não tinham
 * onKeyDown, então a tecla "ir" do teclado do celular não fazia efeito e o
 * visitante tinha de recolher o teclado para achar o botão.
 *
 * A regra de Enter é a mesma do botão (bloco válido + etapa válida + não está
 * gravando), para o atalho nunca furar uma validação que o botão respeita.
 */
const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");

const helper = (() => {
  const i = player.indexOf("const avancarComEnter");
  expect(i, "avancarComEnter não encontrado").toBeGreaterThan(-1);
  return player.slice(i, i + 420);
})();

describe("Enter avança o quiz", () => {
  it("usa o mesmo critério do botão", () => {
    expect(helper).toContain("!terminal || !canSubmit || !stepValid || saving");
  });

  it("não age no meio da composição de IME", () => {
    expect(helper).toContain("isComposing");
  });

  it("está ligado nos 4 campos de linha única (bloco simples + 3 do Formulário)", () => {
    expect((player.match(/onKeyDown=\{avancarComEnter\(/g) ?? []).length).toBe(4);
  });

  it("o Formulário envia o objeto inteiro, o bloco simples o valor", () => {
    expect((player.match(/avancarComEnter\(formValue\)/g) ?? []).length).toBe(3);
    expect(player).toContain("avancarComEnter(value)");
  });

  it("textarea NÃO avança: Enter ali é quebra de linha", () => {
    const i = player.indexOf("<textarea");
    const fim = player.indexOf("/>", i);
    expect(i).toBeGreaterThan(-1);
    expect(player.slice(i, fim)).not.toContain("avancarComEnter");
  });

  it("nome e telefone declaram autocomplete", () => {
    expect(player).toContain('autoComplete="name"');
    expect(player).toContain('block.type === "phone" ? "tel"');
  });
});
