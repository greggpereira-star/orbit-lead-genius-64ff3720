import { afterEach, describe, expect, it, vi } from "vitest";
import { alternarTelaCheiaDoNavegador, definirTelaCheia, telaCheiaAtiva } from "./modoFoco";

describe("tela cheia da aplicação", () => {
  afterEach(() => definirTelaCheia(false));

  it("liga, desliga e avisa quem escuta só quando o valor muda", async () => {
    const modulo = await import("./modoFoco");
    expect(telaCheiaAtiva()).toBe(false);
    definirTelaCheia(true);
    expect(telaCheiaAtiva()).toBe(true);
    definirTelaCheia(true);
    definirTelaCheia(false);
    expect(telaCheiaAtiva()).toBe(false);
    expect(typeof modulo.useTelaCheia).toBe("function");
  });
  it("a tela cheia do navegador falha em silêncio (não suportada ou recusada)", async () => {
    vi.stubGlobal("document", { fullscreenElement: null, documentElement: { requestFullscreen: () => Promise.reject(new Error("recusado")) } });
    await expect(alternarTelaCheiaDoNavegador(true)).resolves.toBeUndefined();
    vi.unstubAllGlobals();
  });
});
