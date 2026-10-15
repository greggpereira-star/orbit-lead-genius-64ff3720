import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { neutralizarFormula, celulaCsv } from "./csvSeguro";

describe("neutralizarFormula", () => {
  it.each([
    ['=HYPERLINK("http://x","a")', `'=HYPERLINK("http://x","a")`],
    ["@SUM(A1)", "'@SUM(A1)"],
    ["+cmd|' /C calc'!A0", "'+cmd|' /C calc'!A0"],
    ["-2+3+cmd", "'-2+3+cmd"],
    ["\t=1+1", "'\t=1+1"],
  ])("neutraliza %s", (entrada, saida) => {
    expect(neutralizarFormula(entrada)).toBe(saida);
  });

  it.each([
    "+5527999998888",
    "+55 (27) 99999-8888",
    "-3",
    "-12,5",
    "Maria",
    "ana@x.com",
    "",
    "100",
  ])("deixa %s como está", (v) => {
    expect(neutralizarFormula(v)).toBe(v);
  });
});

describe("celulaCsv", () => {
  it("escapa aspas e neutraliza", () => {
    expect(celulaCsv('=1+"2"')).toBe(`"'=1+""2"""`);
    expect(celulaCsv(null)).toBe('""');
  });
});

describe("todo exportador passa pela célula segura", () => {
  const leads = readFileSync("src/routes/_app.leads.tsx", "utf8");
  const quiz = readFileSync("src/modules/quiz/lib/csvDeRespostas.ts", "utf8");
  const forms = readFileSync("src/modules/capture/services/formService.ts", "utf8");
  it("leads, respostas do quiz e formulários", () => {
    expect(leads).toContain("celulaCsv(c)");
    expect(quiz).toContain("return celulaCsv(v);");
    expect(forms).toContain("const campo = (v: unknown) => celulaCsv(v);");
  });
  it("nenhum voltou a montar a célula à mão", () => {
    for (const f of [leads, quiz, forms]) expect(f).not.toMatch(/replace\(\/"\/g, '""'\)/);
  });
});
