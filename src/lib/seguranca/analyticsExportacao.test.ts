import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lib = readFileSync("src/modules/analytics/lib/exportacao.ts", "utf8");
const botao = readFileSync("src/modules/analytics/components/BotaoExportarCsv.tsx", "utf8");

describe("exportação CSV do Analytics", () => {
  it("todo texto passa pelo neutralizador de fórmula do projeto", () => {
    expect(lib).toContain('from "@/lib/csvSeguro"');
    expect(lib).toMatch(/celulaCsv\(v \?\? ""\)/);
  });
  it("não exporta lead por lead: só agregados, sem nome, e-mail ou telefone", () => {
    expect(lib).not.toMatch(/\b(email|phone|telefone)\b/i);
  });
  it("botão com 44px no celular e desabilitado sem dados", () => {
    expect(botao).toContain("h-11 md:h-8");
    expect(botao).toMatch(/disabled=\{desabilitado\}/);
  });
});
