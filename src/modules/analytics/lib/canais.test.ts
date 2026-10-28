import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANAIS_ATRIBUIVEIS, ROTULO_DO_CANAL, fatiasDeCanal, rotuloDoCanal } from "./canais";

const sql = readFileSync("supabase/migrations/20261102200000_origem_por_mensagem.sql", "utf8");

describe("canais de origem", () => {
  it("os canais atribuíveis são exatamente os do CHECK do banco (nas 3 listas da migration)", () => {
    const listas = [...sql.matchAll(/'meta_anuncio',[^)]*?'outro'/g)].map((m) =>
      [...m[0].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort(),
    );
    expect(listas.length).toBeGreaterThanOrEqual(3); // coluna, regras, definir_origem_do_lead
    for (const l of listas) expect(l).toEqual([...CANAIS_ATRIBUIVEIS].sort());
  });

  it("todo canal que o banco pode devolver tem rótulo", () => {
    const corpo = sql.slice(
      sql.indexOf("FUNCTION public.canal_do_lead"),
      sql.indexOf("REVOKE ALL ON FUNCTION public.canal_do_lead"),
    );
    const devolvidos = new Set([...corpo.matchAll(/THEN '([a-z_]+)'/g)].map((m) => m[1]));
    devolvidos.add("nao_rastreado");
    for (const c of devolvidos) expect(ROTULO_DO_CANAL[c], c).toBeTruthy();
    for (const c of CANAIS_ATRIBUIVEIS) expect(ROTULO_DO_CANAL[c], c).toBeTruthy();
  });

  it("a prova de anúncio vem ANTES do canal atribuído no CASE do banco", () => {
    const corpo = sql.slice(sql.indexOf("FUNCTION public.canal_do_lead"));
    const pos = (t: string) => corpo.indexOf(t);
    expect(pos("'google_anuncio'")).toBeLessThan(pos("l.origem_canal IS NOT NULL"));
    expect(pos("'whatsapp_anuncio'")).toBeLessThan(pos("l.origem_canal IS NOT NULL"));
    expect(pos("'meta_anuncio'")).toBeLessThan(pos("l.origem_canal IS NOT NULL"));
    expect(pos("'link_rastreado'")).toBeLessThan(pos("l.origem_canal IS NOT NULL"));
  });

  it("canal desconhecido aparece como veio, em vez de sumir", () => {
    expect(rotuloDoCanal("canal_novo")).toBe("canal_novo");
  });
});

describe("fatiasDeCanal", () => {
  it("calcula percentuais, ordena e destaca o não rastreado", () => {
    const r = fatiasDeCanal([
      { canal: "nao_rastreado", leads: 2 },
      { canal: "meta_anuncio", leads: "630" },
      { canal: "quiz", leads: 10 },
      { canal: "api", leads: 0 },
    ]);
    expect(r.total).toBe(642);
    expect(r.fatias.map((f) => f.canal)).toEqual(["meta_anuncio", "quiz", "nao_rastreado"]);
    expect(r.naoRastreados).toBe(2);
    expect(r.percentualNaoRastreado).toBe(0.3);
    expect(r.fatias[0].percentual).toBe(98.1);
  });
  it("sem leads: tudo zero, sem divisão por zero", () => {
    expect(fatiasDeCanal([])).toEqual({
      total: 0,
      fatias: [],
      naoRastreados: 0,
      percentualNaoRastreado: 0,
    });
  });
});
