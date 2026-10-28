import { describe, expect, it } from "vitest";

import { planejarSelecao } from "./meta-paginas";

const disponiveis = [{ id: "taciane" }, { id: "sossae" }, { id: "outra" }];

describe("planejarSelecao", () => {
  it("só entra o que foi escolhido: as demais páginas da conta da Meta ficam de fora", () => {
    const p = planejarSelecao({ disponiveis, daEmpresa: [], deOutrasEmpresas: ["sossae"], escolhidas: ["taciane"] });
    expect(p.adicionar).toEqual(["taciane"]);
    expect(p.remover).toEqual([]);
  });
  it("recusa página que já é de outra empresa, mesmo que a pessoa a marque", () => {
    const p = planejarSelecao({ disponiveis, daEmpresa: [], deOutrasEmpresas: ["sossae"], escolhidas: ["taciane", "sossae"] });
    expect(p.deOutraEmpresa).toEqual(["sossae"]);
    expect(p.adicionar).toEqual(["taciane"]);
  });
  it("recusa página que a conexão não enxerga (id inventado)", () => {
    const p = planejarSelecao({ disponiveis, daEmpresa: [], deOutrasEmpresas: [], escolhidas: ["999"] });
    expect(p.indisponiveis).toEqual(["999"]);
    expect(p.adicionar).toEqual([]);
  });
  it("página que a empresa já tem é mantida, e a desmarcada sai", () => {
    const p = planejarSelecao({
      disponiveis,
      daEmpresa: ["taciane", "outra"],
      deOutrasEmpresas: [],
      escolhidas: ["taciane"],
    });
    expect(p.manter).toEqual(["taciane"]);
    expect(p.remover).toEqual(["outra"]);
  });
  it("a página da própria empresa nunca conta como 'de outra empresa'", () => {
    const p = planejarSelecao({ disponiveis, daEmpresa: ["taciane"], deOutrasEmpresas: ["taciane"], escolhidas: ["taciane"] });
    expect(p.deOutraEmpresa).toEqual([]);
    expect(p.manter).toEqual(["taciane"]);
  });
  it("selecionar nada tira todas as páginas, sem tocar nas dos outros", () => {
    const p = planejarSelecao({ disponiveis, daEmpresa: ["taciane"], deOutrasEmpresas: ["sossae"], escolhidas: [] });
    expect(p.remover).toEqual(["taciane"]);
    expect(p.adicionar).toEqual([]);
  });
  it("id repetido na escolha não duplica", () => {
    const p = planejarSelecao({ disponiveis, daEmpresa: [], deOutrasEmpresas: [], escolhidas: ["taciane", "taciane"] });
    expect(p.adicionar).toEqual(["taciane"]);
  });
});

import { readFileSync } from "node:fs";

describe("migration: uma página, uma empresa, token só no servidor", () => {
  const sql = readFileSync("supabase/migrations/20261108100000_paginas_meta_de_uma_empresa.sql", "utf8");
  it("cria o índice único em page_id", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS meta_lead_pages_page_id_unico ON public\.meta_lead_pages \(page_id\)/);
  });
  it("não deixa o token da página legível pelo navegador", () => {
    expect(sql).toMatch(/REVOKE SELECT ON public\.meta_lead_pages FROM authenticated/);
    const concedidas = sql.slice(sql.indexOf("GRANT SELECT ("), sql.indexOf(") ON public.meta_lead_pages"));
    expect(concedidas).not.toContain("page_access_token");
  });
  it("na limpeza, mantém a mais antiga e só desativa (não apaga) os formulários", () => {
    expect(sql).toMatch(/ORDER BY created_at, id/);
    expect(sql).not.toMatch(/DELETE FROM public\.meta_lead_forms/);
  });
});

describe("OAuth e escolha de páginas", () => {
  const oauth = readFileSync("src/lib/meta-oauth.functions.ts", "utf8");
  it("o retorno do OAuth não grava as páginas que a Meta devolveu", () => {
    const complete = oauth.slice(oauth.indexOf("export const completeMetaOAuth"), oauth.indexOf("export const getMetaConnection"));
    expect(complete).not.toMatch(/\.insert\(|\.upsert\(\s*\{\s*company_id: companyId,\s*connection_id: conn\.id,\s*page_id/);
    expect(complete).toContain("jaEscolhidas");
  });
  it("escolher página exige dono/admin, consulta a Meta de novo e nunca devolve token", () => {
    const escolha = oauth.slice(oauth.indexOf("export const listMetaPageCandidates"), oauth.indexOf("// --------- SUBSCRIBE PAGE"));
    expect(escolha).toContain("podeAdministrar(role)");
    expect(escolha).toContain("planejarSelecao");
    const lista = escolha.slice(0, escolha.indexOf("export const saveMetaPages"));
    expect(lista).not.toMatch(/page_access_token|access_token:/);
  });
});
