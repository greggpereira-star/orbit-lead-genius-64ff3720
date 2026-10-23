import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/core/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { CAMPOS_POR_EVENTO, EVENTOS, normalizarCondicoes } from "./automationService";

describe('gatilho "Etiqueta aplicada"', () => {
  it("está no vocabulário e entrega o campo etiqueta", () => {
    expect(EVENTOS.some((e) => e.valor === "tag_added")).toBe(true);
    expect(CAMPOS_POR_EVENTO.tag_added).toContain("etiqueta");
  });

  it("todo evento do vocabulário tem lista de campos", () => {
    for (const e of EVENTOS) expect(CAMPOS_POR_EVENTO[e.valor], e.valor).toBeDefined();
  });

  it("o valor da condição de etiqueta vira minúsculo e sem espaço nas pontas", () => {
    expect(
      normalizarCondicoes([{ campo: "etiqueta", operador: "igual", valor: "  Orçamento " }]),
    ).toEqual([{ campo: "etiqueta", operador: "igual", valor: "orçamento" }]);
  });

  it("não mexe nas outras condições e descarta a sem campo", () => {
    expect(
      normalizarCondicoes([
        { campo: "nome", operador: "igual", valor: " João " },
        { campo: "", operador: "igual", valor: "x" },
      ]),
    ).toEqual([{ campo: "nome", operador: "igual", valor: " João " }]);
  });
});

describe("migração do gatilho de etiqueta", () => {
  it("manda a etiqueta em minúsculas, como a tela guarda a condição", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(
      "supabase/migrations/20261023140000_gatilho_etiqueta_aplicada.sql",
      "utf8",
    );
    expect(sql).toContain("'etiqueta', lower(btrim(NEW.tag_name))");
    expect(sql).toContain("'tag_added'");
    expect(sql).toContain("EXCEPTION WHEN OTHERS");
  });
});
