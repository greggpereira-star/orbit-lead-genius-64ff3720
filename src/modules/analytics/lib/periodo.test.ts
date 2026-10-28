import { describe, expect, it } from "vitest";
import {
  PERIODO_PADRAO,
  PERIODOS,
  fraseDoPeriodo,
  normalizarPeriodo,
  periodoDaUrl,
  periodoParaUrl,
  rotuloDoPeriodo,
} from "./periodo";

describe("período único", () => {
  it("aceita os quatro períodos, como texto ou número", () => {
    for (const p of PERIODOS) expect(normalizarPeriodo(p.valor)).toBe(p.valor);
    expect(normalizarPeriodo(7)).toBe("7");
  });
  it("lixo na URL cai no padrão (30 dias), nunca num período inventado", () => {
    for (const ruim of [undefined, null, "", "0", "1", "31", "abc", "30; drop", {}, [], -7]) {
      expect(normalizarPeriodo(ruim)).toBe(PERIODO_PADRAO);
    }
    expect(PERIODO_PADRAO).toBe("30");
  });
  it("todo período tem rótulo", () => {
    expect(rotuloDoPeriodo("7")).toBe("Últimos 7 dias");
    expect(rotuloDoPeriodo("365")).toBe("Último ano");
  });

  it("frase gramatical para o subtítulo", () => {
    expect(fraseDoPeriodo("7")).toBe("nos últimos 7 dias");
    expect(fraseDoPeriodo("30")).toBe("nos últimos 30 dias");
    expect(fraseDoPeriodo("365")).toBe("no último ano");
  });
  it("na URL o período é NÚMERO (sem aspas) e volta igual", () => {
    for (const p of PERIODOS) expect(periodoDaUrl(periodoParaUrl(p.valor))).toBe(p.valor);
    expect(periodoParaUrl("30")).toBe(30);
    expect(typeof periodoParaUrl("7")).toBe("number");
    expect(periodoDaUrl(undefined)).toBe("30");
  });
});
