import { describe, expect, it } from "vitest";
import { notaDeAvaliacao, pesquisaEmAberto, VALIDADE_DA_PESQUISA_MS } from "./avaliacao";

describe("nota da avaliação do atendimento", () => {
  it("só a mensagem inteira conta, de 1 a 5", () => {
    for (const t of ["1", "5", " 3 ", "4.", "2!", "5 ."])
      expect(notaDeAvaliacao(t), t).not.toBeNull();
    expect(notaDeAvaliacao("4")).toBe(4);
    expect(notaDeAvaliacao(" 5! ")).toBe(5);
  });

  it("frase com número, 0, 6 e 10 não são nota", () => {
    for (const t of [
      "0",
      "6",
      "10",
      "15",
      "5 minutos",
      "tenho 2 perguntas",
      "nota 5",
      "",
      "   ",
      "a5",
    ])
      expect(notaDeAvaliacao(t), t).toBeNull();
    expect(notaDeAvaliacao(null)).toBeNull();
    expect(notaDeAvaliacao(undefined)).toBeNull();
  });
});

describe("pesquisa em aberto", () => {
  const agora = new Date("2026-10-24T12:00:00Z");
  const h = (n: number) => new Date(agora.getTime() - n * 3600_000).toISOString();

  it("aberta: pedida há menos de 48 h e sem nota", () => {
    expect(pesquisaEmAberto({ csat_requested_at: h(1), csat_score: null }, agora)).toBe(true);
    expect(pesquisaEmAberto({ csat_requested_at: h(47), csat_score: null }, agora)).toBe(true);
  });

  it("fechada: sem pedido, já respondida ou vencida", () => {
    expect(pesquisaEmAberto({ csat_requested_at: null, csat_score: null }, agora)).toBe(false);
    expect(pesquisaEmAberto({ csat_requested_at: h(1), csat_score: 4 }, agora)).toBe(false);
    expect(pesquisaEmAberto({ csat_requested_at: h(49), csat_score: null }, agora)).toBe(false);
    expect(VALIDADE_DA_PESQUISA_MS).toBe(48 * 3600_000);
  });
});
