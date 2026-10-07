import { describe, it, expect } from "vitest";
import { naturezaDaEtapa, resumirEtapa, rolagemParaCentralizar } from "./trilhaDeEtapas";
import type { ConversaoDaEtapa } from "./stepConversion";

describe("naturezaDaEtapa", () => {
  it("sem bloco nenhum é vazia", () => {
    expect(naturezaDaEtapa([])).toBe("vazia");
  });

  it("resultado ganha de captura na mesma etapa", () => {
    expect(naturezaDaEtapa(["captura", "resultado"])).toBe("resultado");
    expect(naturezaDaEtapa(["captura", "oferta"])).toBe("resultado");
  });

  it("captura ganha de conteúdo", () => {
    expect(naturezaDaEtapa(["basico", "captura", "midia"])).toBe("captura");
  });

  it("o resto é percurso", () => {
    expect(naturezaDaEtapa(["interacao", "midia"])).toBe("percurso");
  });
});

describe("resumirEtapa", () => {
  const conversao = (p: Partial<ConversaoDaEtapa>): ConversaoDaEtapa => ({
    stepId: "s1",
    visitantes: 100,
    avancaram: 63,
    taxa: 0.63,
    faixa: "media",
    ...p,
  });

  it("numera a partir de 1 e inventa nome quando não há", () => {
    const r = resumirEtapa({ id: "s1", indice: 16, categorias: ["interacao"] });
    expect(r.numero).toBe(17);
    expect(r.nome).toBe("Etapa 17");
  });

  it("mostra a taxa quando há visitantes suficientes", () => {
    const r = resumirEtapa({
      id: "s1",
      indice: 0,
      nome: "Entrada",
      categorias: ["interacao"],
      conversao: conversao({}),
    });
    expect(r.percentual).toBe(63);
    expect(r.cor).not.toBeNull();
    expect(r.titulo).toContain("63% avançaram (63 de 100 em 30 dias)");
  });

  it("não inventa taxa abaixo do mínimo confiável", () => {
    const r = resumirEtapa({
      id: "s1",
      indice: 0,
      categorias: ["interacao"],
      conversao: conversao({ visitantes: 3, avancaram: 1, taxa: 0.33 }),
    });
    expect(r.percentual).toBeNull();
    expect(r.cor).toBeNull();
    expect(r.titulo).toContain("poucos para uma taxa confiável");
  });

  it("taxa nula (última etapa) não vira 0%", () => {
    const r = resumirEtapa({
      id: "s1",
      indice: 23,
      categorias: ["resultado"],
      conversao: conversao({ taxa: null, faixa: "sem-dados" }),
    });
    expect(r.percentual).toBeNull();
  });

  it("etapa vazia diz o que fazer", () => {
    const r = resumirEtapa({ id: "s1", indice: 0, categorias: [] });
    expect(r.natureza).toBe("vazia");
    expect(r.titulo).toContain("vazia — escolha um bloco");
  });

  it("singular e plural de componente", () => {
    expect(resumirEtapa({ id: "a", indice: 0, categorias: ["basico"] }).titulo).toContain(
      "1 componente",
    );
    expect(resumirEtapa({ id: "a", indice: 0, categorias: ["basico", "midia"] }).titulo).toContain(
      "2 componentes",
    );
  });
});

describe("rolagemParaCentralizar", () => {
  const visivel = 600;
  const total = 3000;

  it("centraliza um cartão do meio", () => {
    expect(
      rolagemParaCentralizar({
        inicioDoAlvo: 1000,
        larguraDoAlvo: 140,
        larguraVisivel: visivel,
        larguraTotal: total,
      }),
    ).toBe(770);
  });

  it("não rola para antes do início", () => {
    expect(
      rolagemParaCentralizar({
        inicioDoAlvo: 0,
        larguraDoAlvo: 140,
        larguraVisivel: visivel,
        larguraTotal: total,
      }),
    ).toBe(0);
  });

  it("não rola para além do fim", () => {
    expect(
      rolagemParaCentralizar({
        inicioDoAlvo: 2860,
        larguraDoAlvo: 140,
        larguraVisivel: visivel,
        larguraTotal: total,
      }),
    ).toBe(2400);
  });
});
