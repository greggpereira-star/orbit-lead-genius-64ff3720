import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CONTATO, EXCLUSAO, PRIVACIDADE, TERMOS, type Pagina } from "./conteudo";

const texto = (p: Pagina) =>
  [p.titulo, p.resumo, ...p.secoes.flatMap((s) => [s.titulo, ...s.paragrafos])].join("\n");

describe("páginas legais exigidas pela Meta", () => {
  it("privacidade fala de WhatsApp, Meta, LGPD, opt-out e contato", () => {
    const t = texto(PRIVACIDADE);
    for (const k of [
      "WhatsApp Business",
      "Meta",
      "LGPD",
      "13.709",
      "sair",
      CONTATO,
      "operador",
      "controlador",
    ])
      expect(t).toContain(k);
  });

  it("exclusão de dados diz COMO pedir (e-mail + assunto) e o que acontece", () => {
    const t = texto(EXCLUSAO);
    expect(t).toContain(CONTATO);
    expect(t).toContain("Exclusão de dados");
    expect(t).toMatch(/Confirmamos a conclusão/);
  });

  it("termos tratam da integração com a Meta e das responsabilidades da cliente", () => {
    const t = texto(TERMOS);
    expect(t).toContain("API oficial do WhatsApp Business");
    expect(t).toMatch(/consentimento/);
    expect(t).toMatch(/janela de 24 horas/);
  });

  it("nenhum marcador de rascunho vai ao ar", () => {
    for (const p of [PRIVACIDADE, TERMOS, EXCLUSAO]) {
      expect(texto(p)).not.toMatch(/TODO|XXX|lorem|\[(?:preencher|inserir)[^\]]*\]|\{\{/i);
      expect(p.secoes.every((s) => s.paragrafos.length > 0 && s.titulo.length > 3)).toBe(true);
    }
  });

  it("não promete o que o sistema não faz (prazo de retenção em dias, certificações)", () => {
    const t = texto(PRIVACIDADE) + texto(TERMOS);
    expect(t).not.toMatch(/\b\d+\s*(dias|meses|anos)\b/i);
    expect(t).not.toMatch(/ISO\s*27001|SOC\s*2|100%\s*seguro/i);
  });

  it("as rotas públicas existem e usam o conteúdo certo", () => {
    for (const [arq, c] of [
      ["privacy", "PRIVACIDADE"],
      ["terms", "TERMOS"],
      ["data-deletion", "EXCLUSAO"],
    ]) {
      const f = readFileSync(`src/routes/${arq}.tsx`, "utf8");
      expect(f).toContain(`createFileRoute("/${arq}")`);
      expect(f).toContain(`pagina={${c}}`);
    }
  });
});
