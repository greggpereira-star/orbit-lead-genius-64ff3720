import { describe, expect, it } from "vitest";
import {
  chaveDoCabecalho,
  gerarChave,
  hashDaChave,
  pareceChave,
  prefixoVisivel,
} from "./chaves.server";
import { escoposValidos, permite } from "./escopos";

describe("chave de API", () => {
  it("gera chave no formato, com hash e prefixo coerentes", () => {
    const { chave, hash, prefixo } = gerarChave();
    expect(pareceChave(chave)).toBe(true);
    expect(hash).toBe(hashDaChave(chave));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(prefixo).toBe(prefixoVisivel(chave));
    expect(prefixo.length).toBe(12);
    expect(chave.startsWith(prefixo)).toBe(true);
  });
  it("duas chaves nunca coincidem", () => {
    const a = new Set(Array.from({ length: 200 }, () => gerarChave().chave));
    expect(a.size).toBe(200);
  });
  it("o hash não revela a chave", () => {
    const { chave, hash } = gerarChave();
    expect(hash).not.toContain(chave.slice(4, 20));
  });
  it("lê o cabeçalho Bearer e recusa o que não é chave", () => {
    const { chave } = gerarChave();
    expect(chaveDoCabecalho(`Bearer ${chave}`)).toBe(chave);
    expect(chaveDoCabecalho(`bearer ${chave}`)).toBe(chave);
    expect(chaveDoCabecalho(chave)).toBeNull();
    expect(chaveDoCabecalho("Bearer abc")).toBeNull();
    expect(chaveDoCabecalho(`Bearer ${chave} extra`)).toBeNull();
    expect(chaveDoCabecalho(null)).toBeNull();
    expect(chaveDoCabecalho("Basic dXNlcjpwYXNz")).toBeNull();
  });
});

describe("escopos", () => {
  it("aceita só os conhecidos, sem repetição", () => {
    expect(escoposValidos(["leads:read", "leads:read"])).toEqual(["leads:read"]);
    expect(escoposValidos(["leads:read", "admin"])).toBeNull();
    expect(escoposValidos([])).toBeNull();
    expect(escoposValidos("leads:read")).toBeNull();
  });
  it("escrever não implica ler", () => {
    expect(permite(["leads:write"], "leads:read")).toBe(false);
    expect(permite(["leads:write"], "leads:write")).toBe(true);
  });
});
