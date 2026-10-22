import { describe, expect, it } from "vitest";
import { guardarIds, lerIdsGuardados } from "./ConexaoManual";

const memoria = () => {
  const d = new Map<string, string>();
  return {
    getItem: (k: string) => d.get(k) ?? null,
    setItem: (k: string, v: string) => void d.set(k, v),
  };
};

describe("IDs da conexão manual guardados no navegador", () => {
  it("guarda e devolve os dois IDs", () => {
    const m = memoria();
    guardarIds(m, { wabaId: "1712518090288635", phoneNumberId: " 1357165290819369 " });
    expect(lerIdsGuardados(m)).toEqual({
      wabaId: "1712518090288635",
      phoneNumberId: "1357165290819369",
    });
  });
  it("não guarda ID inválido nem devolve lixo", () => {
    const m = memoria();
    guardarIds(m, { wabaId: "abc", phoneNumberId: "1357165290819369" });
    expect(lerIdsGuardados(m)).toBeNull();
    m.setItem("wa-conexao-manual-ids", "{quebrado");
    expect(lerIdsGuardados(m)).toBeNull();
  });
  it("sem armazenamento (ou que lança) não derruba a tela", () => {
    expect(lerIdsGuardados(null)).toBeNull();
    expect(() => guardarIds(null, { wabaId: "12345", phoneNumberId: "67890" })).not.toThrow();
    const quebrado = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    expect(lerIdsGuardados(quebrado)).toBeNull();
    expect(() => guardarIds(quebrado, { wabaId: "12345", phoneNumberId: "67890" })).not.toThrow();
  });
});
