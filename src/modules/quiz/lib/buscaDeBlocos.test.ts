import { describe, it, expect } from "vitest";
import { normalizar, filtrarBlocos } from "./buscaDeBlocos";

const rotulo = (c: string) => ({ captura: "Captura", midia: "Mídia" })[c] ?? c;

const itens = [
  { def: { label: "Vídeo", description: "Um vídeo hospedado", category: "midia" } },
  { def: { label: "Telefone", description: "Captura o WhatsApp do lead", category: "captura" } },
  { def: { label: "E-mail", description: "Captura o e-mail", category: "captura" } },
];

describe("normalizar", () => {
  it("tira acento e caixa", () => {
    expect(normalizar("Vídeo")).toBe("video");
    expect(normalizar("  MÍDIA ")).toBe("midia");
  });
});

describe("filtrarBlocos", () => {
  it("termo vazio devolve tudo", () => {
    expect(filtrarBlocos(itens, "", rotulo)).toHaveLength(3);
    expect(filtrarBlocos(itens, "   ", rotulo)).toHaveLength(3);
  });

  it("acha sem acento", () => {
    expect(filtrarBlocos(itens, "video", rotulo).map((i) => i.def.label)).toEqual(["Vídeo"]);
  });

  it("acha pela descrição, não só pelo nome", () => {
    expect(filtrarBlocos(itens, "whatsapp", rotulo).map((i) => i.def.label)).toEqual(["Telefone"]);
  });

  it("acha pelo rótulo da categoria", () => {
    expect(filtrarBlocos(itens, "captura", rotulo).map((i) => i.def.label)).toEqual([
      "Telefone",
      "E-mail",
    ]);
  });

  it("sem resultado devolve lista vazia, não a lista inteira", () => {
    expect(filtrarBlocos(itens, "zzz", rotulo)).toHaveLength(0);
  });

  it("não altera a lista original", () => {
    const copia = [...itens];
    filtrarBlocos(itens, "video", rotulo);
    expect(itens).toEqual(copia);
  });
});
