import { describe, expect, it } from "vitest";
import { duracaoCurta } from "./duracao";

describe("duracaoCurta", () => {
  it("minutos até 59", () => {
    expect(duracaoCurta(1)).toBe("1 min");
    expect(duracaoCurta(45)).toBe("45 min");
    expect(duracaoCurta(59)).toBe("59 min");
  });

  it("horas cheias e com minutos", () => {
    expect(duracaoCurta(60)).toBe("1 h");
    expect(duracaoCurta(180)).toBe("3 h");
    expect(duracaoCurta(125)).toBe("2 h 5 min");
    expect(duracaoCurta(1246)).toBe("20 h 46 min");
    expect(duracaoCurta(1380)).toBe("23 h");
  });

  it("passa de 24 h continua em horas (sem dias)", () => {
    expect(duracaoCurta(1500)).toBe("25 h");
    expect(duracaoCurta(1440 + 90)).toBe("25 h 30 min");
  });

  it("valor vazio, negativo ou inválido não vira 'NaN min'", () => {
    for (const v of [0, -5, 0.4, NaN, null, undefined, "abc", ""])
      expect(duracaoCurta(v as never), String(v)).toBe("menos de 1 min");
    expect(duracaoCurta("90")).toBe("1 h 30 min");
  });
});
