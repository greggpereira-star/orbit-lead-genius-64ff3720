import { describe, it, expect } from "vitest";
import { caminhoDeUrlAssinada, caminhoValido, estabilizarMidia, urlEstavel } from "./midiaEstavel";

const CAMINHO = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.png";
const ASSINADA = `https://api.exemplo.com/storage/v1/object/sign/quiz-media/${CAMINHO}?token=eyJhbGciOi.abc.def`;

describe("midiaEstavel", () => {
  it("extrai o caminho de uma URL assinada, em qualquer host", () => {
    expect(caminhoDeUrlAssinada(ASSINADA)).toBe(CAMINHO);
    expect(caminhoDeUrlAssinada(ASSINADA.replace("api.exemplo.com", "localhost:54321"))).toBe(CAMINHO);
  });
  it("não mexe em URL que não é do bucket do quiz", () => {
    expect(caminhoDeUrlAssinada("https://x.com/storage/v1/object/sign/outro-bucket/a.png?token=1")).toBeNull();
    expect(caminhoDeUrlAssinada("https://images.unsplash.com/photo.jpg")).toBeNull();
  });
  it("reescreve em qualquer ponto do schema, sem alterar o resto", () => {
    const schema = {
      blocks: [{ id: "a", mediaUrl: ASSINADA, title: "Texto com https://x.com", itens: [{ url: ASSINADA }, { url: "https://wa.me/55" }] }],
      design: { coverUrl: ASSINADA, radius: 8 },
    };
    const r = estabilizarMidia(schema);
    expect(r.blocks[0].mediaUrl).toBe(urlEstavel(CAMINHO));
    expect(r.blocks[0].itens[0].url).toBe(urlEstavel(CAMINHO));
    expect(r.blocks[0].itens[1].url).toBe("https://wa.me/55");
    expect(r.blocks[0].title).toBe("Texto com https://x.com");
    expect(r.design.coverUrl).toBe(urlEstavel(CAMINHO));
    expect(r.design.radius).toBe(8);
    expect(schema.blocks[0].mediaUrl).toBe(ASSINADA); // não muta a entrada
  });
  it("recusa caminho com .. ou fora do padrão", () => {
    for (const c of ["../x", "a/../b", "a//b", "/a", "a b", "", "a/b/c/d/e/f/g/h"]) expect(caminhoValido(c)).toBe(false);
    expect(caminhoValido(CAMINHO)).toBe(true);
  });
});

import { readFileSync } from "node:fs";
describe("upload e leitura pública usam o endereço estável", () => {
  it("mediaService grava urlEstavel no schema, não URL assinada", () => {
    const f = readFileSync("src/modules/quiz/services/mediaService.ts", "utf8");
    expect(f).toContain("urlEstavel(path)");
    expect(f).not.toMatch(/url: signed\.signedUrl/);
  });
  it("getPublishedBySlug reescreve URLs antigas na leitura", () => {
    const f = readFileSync("src/modules/quiz/services/quizService.ts", "utf8");
    expect(f).toContain("schema: estabilizarMidia(schema)");
  });
});
