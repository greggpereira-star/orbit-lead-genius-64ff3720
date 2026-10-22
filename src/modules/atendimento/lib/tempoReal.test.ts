import { beforeEach, describe, expect, it } from "vitest";
import { esperaDaReconexao, intervaloDeReleitura, tempoReal } from "./tempoReal";

beforeEach(() => tempoReal.reiniciar());

describe("tempoReal", () => {
  it("começa conectando, sem tentativas", () => {
    expect(tempoReal.ler()).toMatchObject({ estado: "conectando", tentativas: 0 });
  });

  it("SUBSCRIBED fica ao vivo e zera tentativas e erro", () => {
    tempoReal.registrar("CHANNEL_ERROR", "boom");
    const r = tempoReal.registrar("SUBSCRIBED");
    expect(r.reconectar).toBe(false);
    expect(tempoReal.ler()).toMatchObject({ estado: "ao_vivo", tentativas: 0, erro: null });
  });

  it.each(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"])(
    "%s pede reconexão e conta a tentativa",
    (s) => {
      const r = tempoReal.registrar(s, "motivo");
      expect(r.reconectar).toBe(true);
      expect(tempoReal.ler()).toMatchObject({
        estado: "reconectando",
        ultimoStatus: s,
        erro: "motivo",
        tentativas: 1,
      });
      tempoReal.registrar(s);
      expect(tempoReal.ler().tentativas).toBe(2);
    },
  );

  it("notifica quem assinou e para depois de cancelar", () => {
    let n = 0;
    const parar = tempoReal.assinar(() => n++);
    tempoReal.registrar("SUBSCRIBED");
    parar();
    tempoReal.registrar("TIMED_OUT");
    expect(n).toBe(1);
  });

  it("expõe a situação para diagnóstico no console", () => {
    tempoReal.registrar("CHANNEL_ERROR", "x");
    const w = (globalThis as unknown as { window?: { __waTempoReal?: { estado: string } } }).window;
    if (w) expect(w.__waTempoReal?.estado).toBe("reconectando");
  });
});

describe("espera e releitura", () => {
  it("a espera dobra até o teto de 30 s", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(esperaDaReconexao)).toEqual([
      2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });
  it("fora do ao vivo relê a cada 8 s; ao vivo, só um seguro lento", () => {
    expect(intervaloDeReleitura("conectando")).toBe(8_000);
    expect(intervaloDeReleitura("reconectando")).toBe(8_000);
    expect(intervaloDeReleitura("ao_vivo")).toBe(120_000);
  });
});
