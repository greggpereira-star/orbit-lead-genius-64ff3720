import { describe, it, expect } from "vitest";
import { DISPOSITIVOS, larguraQueCabe, mostrarDobra } from "./dispositivoDoCanvas";

describe("DISPOSITIVOS", () => {
  it("todo aparelho tem largura e altura", () => {
    for (const [nome, m] of Object.entries(DISPOSITIVOS)) {
      expect(m.largura, nome).toBeGreaterThan(0);
      expect(m.altura, nome).toBeGreaterThan(0);
      expect(m.rotulo, nome).toBeTruthy();
    }
  });

  it("celular é mais estreito que tablet, que é mais estreito que notebook", () => {
    expect(DISPOSITIVOS.mobile.largura).toBeLessThan(DISPOSITIVOS.tablet.largura);
    expect(DISPOSITIVOS.tablet.largura).toBeLessThan(DISPOSITIVOS.desktop.largura);
  });
});

describe("larguraQueCabe", () => {
  it("encolhe quando a área é menor — o caso medido do desktop", () => {
    expect(larguraQueCabe(1280, 1105)).toBe(1105);
  });

  it("não estica quando sobra espaço", () => {
    expect(larguraQueCabe(390, 1105)).toBe(390);
  });

  it("área ainda não medida devolve a preferida, não zero", () => {
    expect(larguraQueCabe(1280, 0)).toBe(1280);
    expect(larguraQueCabe(1280, -5)).toBe(1280);
    expect(larguraQueCabe(1280, NaN)).toBe(1280);
  });
});

describe("mostrarDobra", () => {
  it("marca a dobra quando há conteúdo depois dela", () => {
    expect(mostrarDobra(1454, 844)).toBe(true);
  });

  it("etapa que cabe inteira não tem dobra", () => {
    expect(mostrarDobra(600, 844)).toBe(false);
  });

  it("não marca por uma sobra de poucos pixels", () => {
    expect(mostrarDobra(848, 844)).toBe(false);
    expect(mostrarDobra(860, 844)).toBe(true);
  });
});
