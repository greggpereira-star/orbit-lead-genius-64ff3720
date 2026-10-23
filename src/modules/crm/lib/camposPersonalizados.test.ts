import { describe, expect, it } from "vitest";
import {
  chaveDoRotulo,
  chaveUnica,
  erroDaDefinicao,
  opcoesDeTexto,
  valorParaEdicao,
  valorParaExibir,
  variavelDaAutomacao,
} from "./camposPersonalizados";

describe("chave do campo", () => {
  it("minúsculas, sem acento, só letras/números/_", () => {
    expect(chaveDoRotulo("Curso de interesse")).toBe("curso_de_interesse");
    expect(chaveDoRotulo("Orçamento (R$)")).toBe("orcamento_r");
    expect(chaveDoRotulo("  Início   desejado ")).toBe("inicio_desejado");
  });

  it("sempre começa por letra e nunca fica vazia", () => {
    expect(chaveDoRotulo("2º semestre")).toBe("c_2_semestre");
    expect(chaveDoRotulo("123")).toBe("c_123");
    expect(chaveDoRotulo("***")).toBe("campo");
    expect(chaveDoRotulo("")).toBe("campo");
  });

  it("até 40 caracteres e casa com a regra do banco", () => {
    const k = chaveDoRotulo("a".repeat(100));
    expect(k.length).toBe(40);
    expect(k).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
  });

  it("chave única na empresa", () => {
    expect(chaveUnica("Curso", [])).toBe("curso");
    expect(chaveUnica("Curso", ["curso"])).toBe("curso_2");
    expect(chaveUnica("Curso", ["curso", "curso_2"])).toBe("curso_3");
    const longa = "a".repeat(40);
    const k = chaveUnica(longa, [longa]);
    expect(k.length).toBeLessThanOrEqual(40);
    expect(k).toMatch(/_2$/);
  });

  it("a variável da automação leva o prefixo cf_", () => {
    expect(variavelDaAutomacao("curso")).toBe("cf_curso");
  });
});

describe("opções da lista", () => {
  it("uma por linha, sem vazias nem repetidas (caixa diferente conta como repetida)", () => {
    expect(opcoesDeTexto("Manhã\n\n  Noite \nmanhã\r\nTarde")).toEqual(["Manhã", "Noite", "Tarde"]);
  });
  it("corta no limite", () => {
    const muitas = Array.from({ length: 80 }, (_, i) => `op${i}`).join("\n");
    expect(opcoesDeTexto(muitas)).toHaveLength(50);
    expect(opcoesDeTexto("x".repeat(81))).toEqual([]);
  });
});

describe("validação da definição", () => {
  it("nome obrigatório e lista com 2 ou mais opções", () => {
    expect(erroDaDefinicao({ label: " ", type: "text", options: [] })).toMatch(/nome/);
    expect(erroDaDefinicao({ label: "Turno", type: "select", options: ["a"] })).toMatch(
      /duas opções/,
    );
    expect(erroDaDefinicao({ label: "Turno", type: "select", options: ["a", "b"] })).toBeNull();
    expect(erroDaDefinicao({ label: "Curso", type: "text", options: [] })).toBeNull();
    expect(erroDaDefinicao({ label: "x".repeat(61), type: "text", options: [] })).toMatch(/60/);
  });
});

describe("exibir e editar valores", () => {
  it("número com vírgula, data em dd/mm/aaaa", () => {
    expect(valorParaExibir("number", 5.5)).toBe("5,5");
    expect(valorParaExibir("number", "6000")).toBe("6.000");
    expect(valorParaExibir("date", "2026-11-10")).toBe("10/11/2026");
    expect(valorParaExibir("text", "Direito")).toBe("Direito");
    expect(valorParaExibir("select", null)).toBe("");
  });
  it("edição: número com vírgula, data em ISO", () => {
    expect(valorParaEdicao("number", 5.5)).toBe("5,5");
    expect(valorParaEdicao("date", "2026-11-10")).toBe("2026-11-10");
    expect(valorParaEdicao("text", undefined)).toBe("");
  });
});
