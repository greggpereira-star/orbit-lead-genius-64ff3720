import { describe, expect, it } from "vitest";
import {
  mesclarCampos,
  validarCamposPersonalizados,
  type DefinicaoDeCampoApi,
} from "./camposPersonalizados";

const defs: DefinicaoDeCampoApi[] = [
  { key: "cargo", label: "Cargo", type: "text", options: [] },
  { key: "faturamento", label: "Faturamento", type: "number", options: [] },
  { key: "nascimento", label: "Nascimento", type: "date", options: [] },
  { key: "porte", label: "Porte", type: "select", options: ["Micro", "Pequena"] },
];

describe("campos personalizados da API", () => {
  it("aceita valores válidos de cada tipo", () => {
    const r = validarCamposPersonalizados(
      { cargo: " Dono ", faturamento: "1500,50", nascimento: "2000-02-29", porte: "Micro" },
      defs,
    );
    expect(r).toEqual({
      ok: true,
      valores: { cargo: "Dono", faturamento: 1500.5, nascimento: "2000-02-29", porte: "Micro" },
      remover: [],
    });
  });
  it("recusa campo inexistente (não grava lixo em custom_fields)", () => {
    const r = validarCamposPersonalizados({ salario: 1 }, defs);
    expect(r.ok).toBe(false);
  });
  it("recusa tipo errado, data impossível e opção fora da lista", () => {
    expect(validarCamposPersonalizados({ faturamento: "muito" }, defs).ok).toBe(false);
    expect(validarCamposPersonalizados({ nascimento: "2026-02-31" }, defs).ok).toBe(false);
    expect(validarCamposPersonalizados({ nascimento: "01/02/2026" }, defs).ok).toBe(false);
    expect(validarCamposPersonalizados({ porte: "Gigante" }, defs).ok).toBe(false);
    expect(validarCamposPersonalizados({ cargo: "x".repeat(501) }, defs).ok).toBe(false);
  });
  it("null ou vazio remove o campo", () => {
    const r = validarCamposPersonalizados({ cargo: null, porte: "  " }, defs);
    expect(r).toEqual({ ok: true, valores: {}, remover: ["cargo", "porte"] });
  });
  it("mescla sobre os campos atuais e remove o que foi limpo", () => {
    const r = validarCamposPersonalizados({ faturamento: 10, cargo: null }, defs);
    if (!r.ok) throw new Error("esperava ok");
    expect(mesclarCampos({ cargo: "Dono", porte: "Micro" }, r)).toEqual({
      porte: "Micro",
      faturamento: 10,
    });
  });
});
