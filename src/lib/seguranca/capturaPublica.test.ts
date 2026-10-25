import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261030100000_captura_publica_com_limites.sql",
  "utf8",
);

describe("captura pública com limites", () => {
  it("fecha a escrita direta anônima em leads e cliques", () => {
    expect(sql).toMatch(/REVOKE INSERT ON public\.leads FROM anon/);
    expect(sql).toMatch(/REVOKE INSERT ON public\.whatsapp_click_events FROM anon/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Public lead capture"/);
  });

  it("limita payload, nota, temperatura e etiquetas do quiz", () => {
    expect(sql).toMatch(/payload_grande/);
    expect(sql).toMatch(/least\(greatest\(coalesce\(p_score, 0\), 0\), 1000\)/);
    expect(sql).toMatch(/''cold'', ''warm'', ''hot''/);
    expect(sql).toMatch(/p_tags\[1:15\]/);
  });
});
