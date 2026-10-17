import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * No menu recolhido só o ícone identifica o item. Dois itens com o mesmo ícone
 * (aconteceu com "Chat ao vivo" e "WhatsApp") são indistinguíveis.
 */
describe("ícones do menu lateral", () => {
  const fonte = readFileSync("src/design-system/components/AppSidebar.tsx", "utf8");
  const itens = [...fonte.matchAll(/\{\s*title:\s*'([^']+)',\s*icon:\s*(\w+)/g)].map((m) => ({ titulo: m[1], icone: m[2] }));

  it("encontra os itens do menu", () => {
    expect(itens.length).toBeGreaterThanOrEqual(10);
  });
  it("cada item tem um ícone próprio", () => {
    const repetidos = itens.filter((a, i) => itens.findIndex((b) => b.icone === a.icone) !== i);
    expect(repetidos).toEqual([]);
  });
  it("WhatsApp e Chat ao vivo se distinguem de relance", () => {
    const por = Object.fromEntries(itens.map((i) => [i.titulo, i.icone]));
    expect(por["WhatsApp"]).toBe("WhatsAppIcon");
    expect(por["Chat ao vivo"]).not.toBe(por["WhatsApp"]);
  });
});
