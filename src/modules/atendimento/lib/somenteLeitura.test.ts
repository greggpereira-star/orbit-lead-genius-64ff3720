import { describe, expect, it } from "vitest";
import { AVISO_DO_MODO, modoDoCompositor } from "./compositor";
import { podeAtender } from "../../../lib/whatsapp/papeis";

const aberta = { aberta: true } as never;
const fechada = { aberta: false } as never;

describe("composer para quem só lê", () => {
  it("visualizador nunca recebe composer, nem com a janela aberta", () => {
    expect(modoDoCompositor({ janela: aberta, optedOut: false, status: "open", somenteLeitura: true })).toBe("somente_leitura");
    expect(modoDoCompositor({ janela: fechada, optedOut: false, status: "open", somenteLeitura: true })).toBe("somente_leitura");
  });
  it("quem atende segue com o comportamento de antes", () => {
    expect(modoDoCompositor({ janela: aberta, optedOut: false, status: "open", somenteLeitura: false })).toBe("texto");
    expect(modoDoCompositor({ janela: aberta, optedOut: true, status: "open" })).toBe("bloqueado");
    expect(modoDoCompositor({ janela: fechada, optedOut: false, status: "open" })).toBe("template");
  });
  it("o aviso explica por que não há composer", () => {
    expect(AVISO_DO_MODO.somente_leitura).toMatch(/somente leitura/i);
  });
  it("só dono, admin e membro atendem; papel desconhecido não", () => {
    expect(["owner", "admin", "member"].every(podeAtender)).toBe(true);
    expect(podeAtender("viewer")).toBe(false);
    expect(podeAtender("qualquer")).toBe(false);
  });
});
