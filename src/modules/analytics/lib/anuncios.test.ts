import { describe, expect, it } from "vitest";
import type { LinhaDeCusto } from "../services/adIntelligenceService";
import {
  AMOSTRA_MINIMA,
  alternarOrdem,
  amostraPequena,
  gastouSemLead,
  ordenarLinhas,
  totalDaTabela,
} from "./anuncios";

const l = (o: Partial<LinhaDeCusto> & { ad_id: string }): LinhaDeCusto => ({
  ad_name: o.ad_id,
  campanha: "c",
  rede: "meta",
  conversas: 0,
  qualificados: 0,
  taxa_qualificacao: 0,
  valor_total: 0,
  dias_ate_qualificar: null,
  gasto: null,
  impressoes: null,
  cliques: null,
  moeda: null,
  custo_por_lead: null,
  custo_por_qualificado: null,
  roas: null,
  vendas: 0,
  valor_ganho: 0,
  ...o,
});

const base = [
  l({
    ad_id: "A",
    gasto: 300,
    conversas: 81,
    custo_por_lead: 9.01,
    qualificados: 1,
    taxa_qualificacao: 1.2,
  }),
  l({ ad_id: "B", gasto: 80, conversas: 0 }),
  l({
    ad_id: "C",
    gasto: 120,
    conversas: 21,
    custo_por_lead: 5.84,
    qualificados: 0,
    taxa_qualificacao: 0,
  }),
  l({ ad_id: "D", conversas: 14, taxa_qualificacao: 7.1, qualificados: 1 }),
];
const ids = (x: LinhaDeCusto[]) => x.map((y) => y.ad_id).join("");

describe("ordenarLinhas", () => {
  it("sem ordem devolve a lista como veio", () => {
    expect(ordenarLinhas(base, null)).toBe(base);
  });
  it("ordena por gasto (maior primeiro) com o que não tem gasto no FIM", () => {
    expect(ids(ordenarLinhas(base, { coluna: "gasto", direcao: "desc" }))).toBe("ACBD");
    expect(ids(ordenarLinhas(base, { coluna: "gasto", direcao: "asc" }))).toBe("BCAD"); // D (sem gasto) continua no fim
  });
  it("custo: o mais barato primeiro; quem não tem custo (sem lead) nunca aparece como 'o mais barato'", () => {
    expect(ids(ordenarLinhas(base, { coluna: "custo_lead", direcao: "asc" }))).toBe("CABD");
  });
  it("não altera a lista original e é estável nos empates", () => {
    const copia = [...base];
    ordenarLinhas(base, { coluna: "leads", direcao: "desc" });
    expect(base).toEqual(copia);
    const iguais = [
      l({ ad_id: "X", conversas: 5 }),
      l({ ad_id: "Y", conversas: 5 }),
      l({ ad_id: "Z", conversas: 5 }),
    ];
    expect(ids(ordenarLinhas(iguais, { coluna: "leads", direcao: "desc" }))).toBe("XYZ");
  });
  it("sem régua (taxa nula) 'qualificados' não ordena: todos ficam como vieram", () => {
    const sem = [
      l({ ad_id: "P", taxa_qualificacao: null, qualificados: 9 }),
      l({ ad_id: "Q", taxa_qualificacao: null, qualificados: 1 }),
    ];
    expect(ids(ordenarLinhas(sem, { coluna: "qualificados", direcao: "desc" }))).toBe("PQ");
  });
});

describe("alternarOrdem", () => {
  it("1º clique no sentido natural (custo: menor primeiro; resto: maior primeiro), 2º inverte, 3º limpa", () => {
    let o = alternarOrdem(null, "custo_lead");
    expect(o).toEqual({ coluna: "custo_lead", direcao: "asc" });
    o = alternarOrdem(o, "custo_lead");
    expect(o).toEqual({ coluna: "custo_lead", direcao: "desc" });
    expect(alternarOrdem(o, "custo_lead")).toBeNull();

    expect(alternarOrdem(null, "leads")).toEqual({ coluna: "leads", direcao: "desc" });
  });
  it("trocar de coluna recomeça do sentido natural da nova", () => {
    expect(alternarOrdem({ coluna: "leads", direcao: "asc" }, "gasto")).toEqual({
      coluna: "gasto",
      direcao: "desc",
    });
  });
});

describe("sinais de leitura", () => {
  it("amostra pequena: tem lead, mas menos que o mínimo", () => {
    expect(AMOSTRA_MINIMA).toBe(30);
    expect(amostraPequena(l({ ad_id: "a", conversas: 29 }))).toBe(true);
    expect(amostraPequena(l({ ad_id: "a", conversas: 30 }))).toBe(false);
    expect(amostraPequena(l({ ad_id: "a", conversas: 0 }))).toBe(false); // sem lead não há custo para desconfiar
  });
  it("gastou e não trouxe lead", () => {
    expect(gastouSemLead(l({ ad_id: "a", gasto: 80, conversas: 0 }))).toBe(true);
    expect(gastouSemLead(l({ ad_id: "a", gasto: 0, conversas: 0 }))).toBe(false);
    expect(gastouSemLead(l({ ad_id: "a", gasto: null, conversas: 0 }))).toBe(false);
    expect(gastouSemLead(l({ ad_id: "a", gasto: 80, conversas: 2 }))).toBe(false);
  });
});

describe("totalDaTabela", () => {
  it("soma leads, qualificados, vendas e valores", () => {
    const t = totalDaTabela(base);
    expect(t.leads).toBe(116);
    expect(t.qualificados).toBe(2);
    expect(t.taxa).toBe(1.7);
  });
  it("sem régua a taxa é nula (não zero); sem leads também", () => {
    expect(
      totalDaTabela([l({ ad_id: "a", conversas: 5, taxa_qualificacao: null })]).taxa,
    ).toBeNull();
    expect(totalDaTabela([l({ ad_id: "a", conversas: 0 })]).taxa).toBeNull();
  });
  it("vendas e valor ganho separados do pipeline", () => {
    const t = totalDaTabela([
      l({ ad_id: "a", conversas: 2, vendas: 1, valor_ganho: 500, valor_total: 900 }),
    ]);
    expect(t).toMatchObject({ vendas: 1, valorGanho: 500, valorPipeline: 900 });
  });
});
