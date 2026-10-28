import { describe, expect, it } from "vitest";

import type { LinhaDeCusto } from "../services/adIntelligenceService";
import { analisarComparativo } from "./comparativo";
import {
  csvDeAnuncios,
  csvDeCanais,
  csvDoFunil,
  csvDoResumo,
  montarCsv,
  nomeDoArquivo,
  numeroCsv,
} from "./exportacao";

const linhas = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

const anuncio = (extra: Partial<LinhaDeCusto> = {}): LinhaDeCusto => ({
  ad_id: "123",
  ad_name: "Criativo A",
  campanha: "Campanha 1",
  rede: "meta",
  conversas: 40,
  qualificados: 4,
  taxa_qualificacao: 10,
  valor_total: 0,
  dias_ate_qualificar: null,
  gasto: 400,
  impressoes: 10000,
  cliques: 300,
  moeda: "BRL",
  custo_por_lead: 10,
  custo_por_qualificado: 100,
  roas: null,
  vendas: 0,
  valor_ganho: 0,
  ...extra,
});

describe("formato", () => {
  it("BOM, ponto e vírgula, quebra CRLF e vírgula decimal", () => {
    const csv = montarCsv(["a", "b"], [["x", numeroCsv(1234.5)]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(linhas(csv)).toEqual(['"a";"b"', '"x";"1234,5"']);
  });
  it("número ausente vira vazio, nunca zero nem traço", () => {
    expect(numeroCsv(null)).toBe("");
    expect(numeroCsv(undefined)).toBe("");
    expect(numeroCsv(Number.NaN)).toBe("");
    expect(numeroCsv(0)).toBe("0");
  });
  it("nome do arquivo diz seção, período e data", () => {
    expect(nomeDoArquivo("anuncios", "30", new Date("2026-10-28T15:00:00Z"))).toBe(
      "analytics-anuncios-30d-2026-10-28.csv",
    );
  });
});

describe("segurança: injeção de fórmula", () => {
  it("nome de anúncio e campanha que começam por = + @ ficam neutralizados", () => {
    const csv = csvDeAnuncios([
      anuncio({ ad_name: '=HYPERLINK("http://x","clique")', campanha: "@SUM(1)" }),
      anuncio({ ad_name: "+cmd|' /C calc'!A0" }),
    ]);
    const [, a, b] = linhas(csv);
    expect(a).toContain(`"'=HYPERLINK(""http://x"",""clique"")"`);
    expect(a).toContain(`"'@SUM(1)"`);
    expect(b).toContain(`"'+cmd`);
  });
});

describe("anúncios", () => {
  it("anúncio sem gasto nem régua sai com células vazias, não zeradas", () => {
    const csv = csvDeAnuncios([
      anuncio({
        gasto: null,
        moeda: null,
        custo_por_lead: null,
        custo_por_qualificado: null,
        taxa_qualificacao: null,
        impressoes: null,
        cliques: null,
      }),
    ]);
    const celulas = linhas(csv)[1].split(";");
    expect(celulas[4]).toBe('""'); // Gasto
    expect(celulas[5]).toBe('""'); // Moeda
    expect(celulas[9]).toBe('""'); // Custo por lead
    expect(celulas[10]).toBe('""'); // Qualificados (sem régua)
    expect(celulas[12]).toBe('""'); // Taxa
  });
  it("mantém a ordem recebida (a que a pessoa escolheu na tela) e uma linha por anúncio", () => {
    const csv = csvDeAnuncios([anuncio({ ad_name: "B" }), anuncio({ ad_name: "A" })]);
    const l = linhas(csv);
    expect(l).toHaveLength(3);
    expect(l[1].startsWith('"B"')).toBe(true);
  });
});

describe("canais e funil", () => {
  it("canais com rótulo, código e percentual", () => {
    const l = linhas(csvDeCanais([{ canal: "nao_rastreado", leads: 2, percentual: 33.3 }]));
    expect(l[1]).toContain('"2";"33,3"');
  });
  it("parados e horas médias só existem em etapa aberta", () => {
    const base = { stage_id: "s", ordem: 1, leads: 5, valor: 0, percentual: 50, barra: 50 };
    const l = linhas(
      csvDoFunil([
        { ...base, nome: "Novo", kind: "open", parados_24h: 3, horas_medias: 30.5 },
        { ...base, nome: "Ganho", kind: "won", parados_24h: 0, horas_medias: null },
      ]),
    );
    expect(l[1]).toContain('"Aberta"');
    expect(l[1].endsWith('"3";"30,5"')).toBe(true);
    expect(l[2].endsWith('"";""')).toBe(true);
  });
});

describe("resumo", () => {
  const janela = {
    leads: 100,
    qualificados: 10,
    vendas: 2,
    valor_ganho: 500,
    identificados: 90,
    primeiro_lead: "2026-01-01T00:00:00Z",
  };
  it("traz o período anterior e a variação quando a comparação é válida", () => {
    const c = analisarComparativo(
      [
        { periodo: "atual", ...janela },
        { periodo: "anterior", ...janela, leads: 50 },
      ],
      new Date("2026-10-01"),
      30,
    );
    const l = linhas(
      csvDoResumo({
        dias: "30",
        leads: 100,
        qualificados: 10,
        taxa: 0.1,
        vendasValor: 500,
        vendasQuantidade: 2,
        origemIdentificada: 0.9,
        comparativo: c,
      }),
    );
    expect(l[1]).toBe('"Leads";"30";"100";"50";"100";"%"');
  });
  it("sem comparação válida as colunas do anterior ficam vazias", () => {
    const l = linhas(
      csvDoResumo({
        dias: "90",
        leads: 507,
        qualificados: 3,
        taxa: 0.006,
        vendasValor: 0,
        vendasQuantidade: 0,
        origemIdentificada: 0.99,
        comparativo: { disponivel: false, motivo: "sem_dados" },
      }),
    );
    expect(l[1]).toBe('"Leads";"90";"507";"";"";""');
  });
  it("variação negativa sai como número com sinal, sem apóstrofo", () => {
    const c = analisarComparativo(
      [
        { periodo: "atual", ...janela, leads: 80 },
        { periodo: "anterior", ...janela },
      ],
      new Date("2026-10-01"),
      30,
    );
    const l = linhas(
      csvDoResumo({
        dias: "30",
        leads: 80,
        qualificados: 10,
        taxa: 0.125,
        vendasValor: 0,
        vendasQuantidade: 0,
        origemIdentificada: 0.9,
        comparativo: c,
      }),
    );
    expect(l[1]).toBe('"Leads";"30";"80";"100";"-20";"%"');
    expect(l[3]).toContain('"p.p."');
  });
});
