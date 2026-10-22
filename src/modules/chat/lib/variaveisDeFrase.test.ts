import { describe, expect, it } from "vitest";
import { aplicarVariaveisDeFrase } from "./variaveisDeFrase";

describe("aplicarVariaveisDeFrase", () => {
  it("troca nome, primeiro nome e demais variáveis", () => {
    const t =
      "Olá {{primeiro_nome}}! Aqui é {{atendente}} da {{empresa}}. ({{nome}}, {{telefone}})";
    expect(
      aplicarVariaveisDeFrase(t, {
        nome: "Maria da Silva",
        telefone: "5521999990000",
        atendente: "Gregg",
        empresa: "Alt",
      }),
    ).toBe("Olá Maria! Aqui é Gregg da Alt. (Maria da Silva, 5521999990000)");
  });

  it("aceita espaços e maiúsculas dentro das chaves", () => {
    expect(aplicarVariaveisDeFrase("Oi {{ Nome }}", { nome: "Ana" })).toBe("Oi Ana");
  });

  it("sem valor, remove a variável e o espaço antes dela", () => {
    expect(aplicarVariaveisDeFrase("Olá {{nome}}, tudo bem?", {})).toBe("Olá, tudo bem?");
    expect(aplicarVariaveisDeFrase("{{nome}}, bom dia", {})).toBe(", bom dia");
  });

  it("mantém variável desconhecida como escrita", () => {
    expect(aplicarVariaveisDeFrase("Oi {{xpto}}", { nome: "Ana" })).toBe("Oi {{xpto}}");
  });
});
