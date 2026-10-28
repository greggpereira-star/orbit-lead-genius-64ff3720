import { describe, expect, it } from "vitest";

import { analisarResposta, formatarDuracao, percentual, type RespostaBruta } from "./resposta";

const base: RespostaBruta = {
  leads_total: 179,
  com_conversa: 1,
  respondidos: 1,
  mediana_segundos: 87,
  p90_segundos: 87,
  ate_5min: 1,
  ate_1h: 1,
  ate_24h: 1,
  so_automacao: 0,
  sem_resposta: 0,
  esperando_agora: 1,
  espera_mais_antiga_segundos: 485756,
  medidos: 1,
  com_contato_registrado: 0,
  respondidos_manual: 0,
};

describe("formatarDuracao", () => {
  it("usa a unidade que a pessoa falaria", () => {
    expect(formatarDuracao(45)).toBe("45 s");
    expect(formatarDuracao(87)).toBe("1 min");
    expect(formatarDuracao(720)).toBe("12 min");
    expect(formatarDuracao(12000)).toBe("3 h 20 min");
    expect(formatarDuracao(7200)).toBe("2 h");
    expect(formatarDuracao(485756)).toBe("6 dias");
  });
  it("não inventa valor quando não há dado", () => {
    expect(formatarDuracao(null)).toBe("—");
    expect(formatarDuracao(Number.NaN)).toBe("—");
    expect(formatarDuracao(-5)).toBe("—");
  });
});

describe("percentual", () => {
  it("divide por zero vira traço, não 0%", () => {
    expect(percentual(0, 0)).toBe("—");
    expect(percentual(1, 4)).toBe("25%");
  });
});

describe("analisarResposta", () => {
  it("diz a cobertura e marca amostra pequena e cobertura baixa", () => {
    const a = analisarResposta(base);
    expect(a.cobertura).toBeCloseTo(1 / 179);
    expect(a.coberturaBaixa).toBe(true);
    expect(a.amostraPequena).toBe(true);
    expect(a.esperandoAgora).toBe(1);
  });
  it("cobertura alta e amostra grande não levantam aviso", () => {
    const a = analisarResposta({ ...base, leads_total: 100, com_conversa: 80, medidos: 80, respondidos: 60 });
    expect(a.coberturaBaixa).toBe(false);
    expect(a.amostraPequena).toBe(false);
  });
  it("a cobertura conta o lead com contato registrado, mesmo sem conversa", () => {
    const a = analisarResposta({
      ...base,
      leads_total: 100,
      com_conversa: 10,
      medidos: 60,
      com_contato_registrado: 55,
      respondidos: 50,
      respondidos_manual: 45,
    });
    expect(a.cobertura).toBeCloseTo(0.6);
    expect(a.coberturaBaixa).toBe(false);
    expect(a.comConversa).toBe(10);
    expect(a.respondidosManual).toBe(45);
  });
  it("sem lead no período a cobertura é nula, não zero", () => {
    expect(analisarResposta({ ...base, leads_total: 0, com_conversa: 0, medidos: 0 }).cobertura).toBeNull();
  });
  it("converte texto numérico e nulos vindos do banco", () => {
    const a = analisarResposta({
      ...base,
      mediana_segundos: "87" as unknown as number,
      p90_segundos: null,
      espera_mais_antiga_segundos: null,
    });
    expect(a.medianaSegundos).toBe(87);
    expect(a.p90Segundos).toBeNull();
    expect(a.esperaMaisAntigaSegundos).toBeNull();
  });
});
