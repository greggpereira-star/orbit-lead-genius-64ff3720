import { describe, expect, it } from "vitest";
import { MODELOS_DE_TEMPLATE } from "./modelosDeTemplate";
import { montarComponentes, temErro, validarTemplate, type DefinicaoDeTemplate } from "./templates";

describe("modelos de template", () => {
  it("há modelos de Utilidade e de Marketing, com id e nome únicos", () => {
    const categorias = new Set(MODELOS_DE_TEMPLATE.map((m) => m.def.categoria));
    expect(categorias).toEqual(new Set(["UTILITY", "MARKETING"]));
    expect(new Set(MODELOS_DE_TEMPLATE.map((m) => m.id)).size).toBe(MODELOS_DE_TEMPLATE.length);
    expect(new Set(MODELOS_DE_TEMPLATE.map((m) => m.def.nome)).size).toBe(
      MODELOS_DE_TEMPLATE.length,
    );
  });

  it("cada modelo já passa na validação (exemplos incluídos), exceto a URL do carrinho de propósito", () => {
    for (const m of MODELOS_DE_TEMPLATE) {
      const erros = validarTemplate({ ...m.def, idioma: "pt_BR" }).filter(
        (p) => p.gravidade === "erro",
      );
      if (m.id === "carrinho") {
        expect(erros.map((e) => e.campo)).toEqual(["botoes"]);
        expect(erros[0].texto).toContain("https://");
      } else {
        expect(erros, m.id).toEqual([]);
      }
    }
  });

  it("modelo de Utilidade não dispara o aviso de promoção", () => {
    for (const m of MODELOS_DE_TEMPLATE.filter((x) => x.def.categoria === "UTILITY")) {
      const avisos = validarTemplate({ ...m.def, idioma: "pt_BR" }).filter(
        (p) => p.gravidade === "aviso" && /promoção/.test(p.texto),
      );
      expect(avisos, m.id).toEqual([]);
    }
  });

  it("o que o modelo monta é o que a Meta recebe: um exemplo por variável", () => {
    const m = MODELOS_DE_TEMPLATE.find((x) => x.id === "lembrete_agendamento")!;
    const corpo = montarComponentes({ ...m.def, idioma: "pt_BR" }).find(
      (c) => (c as { type: string }).type === "BODY",
    ) as { example: { body_text: string[][] } };
    expect(corpo.example.body_text[0]).toHaveLength(3);
    expect(temErro(validarTemplate({ ...m.def, idioma: "pt_BR" }))).toBe(false);
  });
});

describe("mensagens do cadastro sem etiqueta interna", () => {
  it("nenhum texto mostrado ao autor carrega [meta] ou [wacli]", () => {
    const casos = [
      { corpo: "Oi {{1}} tudo bem com você hoje {{2}}" },
      { cabecalho: "Oi 😀", corpo: "Texto." },
      { cabecalho: "linha\n*negrito*", corpo: "Texto." },
      { cabecalho: "{{1}} e {{2}}", corpo: "Texto." },
    ];
    for (const c of casos) {
      const d: DefinicaoDeTemplate = {
        nome: "a_b",
        idioma: "pt_BR",
        categoria: "UTILITY",
        ...c,
        corpo: c.corpo ?? "Texto.",
      };
      const textos = validarTemplate(d).map((p) => p.texto);
      expect(textos.length).toBeGreaterThan(0);
      for (const t of textos) expect(t).not.toMatch(/\[(meta|wacli)\]/);
    }
  });

  it("corpo só de variáveis não avisa 'começa com variável' (ainda não há texto)", () => {
    const p = validarTemplate({
      nome: "a_b",
      idioma: "pt_BR",
      categoria: "UTILITY",
      corpo: "{{1}}{{2}}",
    });
    expect(p.filter((x) => /começa ou termina/.test(x.texto))).toEqual([]);
    const q = validarTemplate({
      nome: "a_b",
      idioma: "pt_BR",
      categoria: "UTILITY",
      corpo: "{{1}} você recebeu o pedido {{2}}",
    });
    expect(q.filter((x) => /começa ou termina/.test(x.texto))).toHaveLength(1);
  });
});
