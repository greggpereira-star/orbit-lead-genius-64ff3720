import { describe, expect, it } from "vitest";
import {
  FALHAS_PARA_DESLIGAR,
  MAX_TENTATIVAS,
  assinar,
  cabecalhoDeAssinatura,
  gerarSegredoDeWebhook,
  proximaEspera,
  verificarAssinatura,
} from "./assinatura.server";

const segredo = "whsec_teste";
const corpo = JSON.stringify({ id: "e1", type: "lead.created" });

describe("assinatura do webhook", () => {
  it("o destinatário confere o que enviamos", () => {
    const t = 1_800_000_000;
    expect(
      verificarAssinatura(cabecalhoDeAssinatura(segredo, t, corpo), segredo, corpo, t + 10),
    ).toBe(true);
  });
  it("corpo alterado, segredo errado ou assinatura truncada falham", () => {
    const t = 1_800_000_000;
    const h = cabecalhoDeAssinatura(segredo, t, corpo);
    expect(verificarAssinatura(h, segredo, corpo + " ", t)).toBe(false);
    expect(verificarAssinatura(h, "whsec_outro", corpo, t)).toBe(false);
    expect(verificarAssinatura(h.slice(0, -4), segredo, corpo, t)).toBe(false);
  });
  it("entrega antiga é recusada (replay) e a futura demais também", () => {
    const t = 1_800_000_000;
    const h = cabecalhoDeAssinatura(segredo, t, corpo);
    expect(verificarAssinatura(h, segredo, corpo, t + 301)).toBe(false);
    expect(verificarAssinatura(h, segredo, corpo, t - 301)).toBe(false);
  });
  it("trocar o timestamp invalida a assinatura (ele entra na conta)", () => {
    const t = 1_800_000_000;
    const v1 = assinar(segredo, t, corpo);
    expect(verificarAssinatura(`t=${t + 1},v1=${v1}`, segredo, corpo, t)).toBe(false);
  });
  it("cabeçalho ausente ou torto não derruba, só recusa", () => {
    expect(verificarAssinatura(null, segredo, corpo, 1)).toBe(false);
    expect(verificarAssinatura("", segredo, corpo, 1)).toBe(false);
    expect(verificarAssinatura("lixo", segredo, corpo, 1)).toBe(false);
    expect(verificarAssinatura("t=abc,v1=zz", segredo, corpo, 1)).toBe(false);
  });
  it("segredo gerado é único e longo", () => {
    const a = gerarSegredoDeWebhook();
    expect(a).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(gerarSegredoDeWebhook()).not.toBe(a);
  });
});

describe("tentativas", () => {
  it("espera cresce e acaba na sexta tentativa", () => {
    expect(proximaEspera(1)).toBe(60);
    expect(proximaEspera(2)).toBe(300);
    expect(proximaEspera(5)).toBe(21600);
    expect(proximaEspera(MAX_TENTATIVAS)).toBeNull();
    expect(MAX_TENTATIVAS).toBe(6);
  });
  it("valores inválidos não geram espera", () => {
    expect(proximaEspera(0)).toBeNull();
    expect(proximaEspera(-1)).toBeNull();
  });
  it("o endpoint só é desligado depois de várias entregas esgotadas", () => {
    expect(FALHAS_PARA_DESLIGAR).toBeGreaterThanOrEqual(5);
  });
});
