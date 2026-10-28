import { describe, expect, it } from "vitest";

import {
  analisarComparativo,
  variacaoEmPontos,
  variacaoPercentual,
  type JanelaBruta,
} from "./comparativo";

const inicio = new Date("2026-09-28T12:00:00Z");
const linha = (periodo: "atual" | "anterior", extra: Partial<JanelaBruta> = {}): JanelaBruta => ({
  periodo,
  leads: 100,
  qualificados: 10,
  vendas: 2,
  valor_ganho: 500,
  identificados: 90,
  primeiro_lead: "2026-07-21T17:29:45Z",
  ...extra,
});

describe("analisarComparativo", () => {
  it("compara quando o anterior está completo", () => {
    const c = analisarComparativo(
      [linha("atual"), linha("anterior", { leads: 50, qualificados: 5 })],
      inicio,
      30,
    );
    expect(c.disponivel).toBe(true);
    if (c.disponivel) {
      expect(c.atual.taxa).toBeCloseTo(0.1);
      expect(c.anterior.taxa).toBeCloseTo(0.1);
      expect(c.anterior.origemIdentificada).toBeCloseTo(1.8);
    }
  });
  it("não compara quando os dados começam depois do início do período anterior", () => {
    // 90 dias: o atual começa em 30/07, o anterior em 01/05; os leads só existem desde 21/07.
    const c = analisarComparativo(
      [linha("atual"), linha("anterior")],
      new Date("2026-07-30T12:00:00Z"),
      90,
    );
    expect(c).toMatchObject({ disponivel: false, motivo: "incompleto" });
  });
  it("sem linha ou sem lead algum não há o que comparar", () => {
    expect(analisarComparativo([], inicio, 30)).toEqual({ disponivel: false, motivo: "sem_dados" });
    expect(
      analisarComparativo(
        [linha("atual", { primeiro_lead: null }), linha("anterior", { primeiro_lead: null })],
        inicio,
        30,
      ),
    ).toEqual({ disponivel: false, motivo: "sem_dados" });
  });
  it("sem régua o qualificado e a taxa ficam nulos, não zero", () => {
    const c = analisarComparativo(
      [linha("atual", { qualificados: null }), linha("anterior", { qualificados: null })],
      inicio,
      30,
    );
    if (!c.disponivel) throw new Error("esperava comparação");
    expect(c.atual.qualificados).toBeNull();
    expect(c.atual.taxa).toBeNull();
  });
  it("avisa base anterior pequena", () => {
    const c = analisarComparativo(
      [linha("atual"), linha("anterior", { leads: 12, identificados: 12 })],
      inicio,
      30,
    );
    if (!c.disponivel) throw new Error("esperava comparação");
    expect(c.baseAnteriorPequena).toBe(true);
  });
});

describe("variações", () => {
  it("percentual com sinal e sem base quando o anterior é zero", () => {
    expect(variacaoPercentual(179, 170)).toBe("+5,3%");
    expect(variacaoPercentual(80, 100)).toBe("−20%");
    expect(variacaoPercentual(100, 100)).toBe("sem variação");
    expect(variacaoPercentual(5, 0)).toBeNull();
  });
  it("pontos percentuais", () => {
    expect(variacaoEmPontos(0.12, 0.1)).toBe("+2 p.p.");
    expect(variacaoEmPontos(0.1, 0.123)).toBe("−2,3 p.p.");
    expect(variacaoEmPontos(null, 0.1)).toBeNull();
  });
});
