import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { aplicarMensageria } from "./meta-capi.server";

const navegador = () => ({
  client_user_agent: "Mozilla",
  client_ip_address: "1.2.3.4",
  fbc: "fb.1.1.x",
  fbp: "fb.1.1.y",
  em: ["hash"],
});

describe("aplicarMensageria", () => {
  it("API oficial: sai com a WABA, sem página do Facebook", () => {
    const u = aplicarMensageria(navegador(), {
      ctwaClid: "CLID",
      whatsappBusinessAccountId: "WABA1",
    });
    expect(u).toMatchObject({
      ctwa_clid: "CLID",
      whatsapp_business_account_id: "WABA1",
      em: ["hash"],
    });
    expect("page_id" in u).toBe(false);
  });

  it("com página, leva a página", () => {
    expect(aplicarMensageria({}, { ctwaClid: "C", pageId: "PG" })).toMatchObject({ page_id: "PG" });
  });

  it("os dois, quando existem", () => {
    expect(
      aplicarMensageria({}, { ctwaClid: "C", pageId: "PG", whatsappBusinessAccountId: "W" }),
    ).toMatchObject({
      page_id: "PG",
      whatsapp_business_account_id: "W",
    });
  });

  it("evento de mensageria não carrega dados de navegador", () => {
    const u = aplicarMensageria(navegador(), { ctwaClid: "C", whatsappBusinessAccountId: "W" });
    for (const k of ["client_user_agent", "client_ip_address", "fbc", "fbp"])
      expect(k in u).toBe(false);
  });

  it("o ctwa_clid vai cru (não hasheado)", () => {
    expect(aplicarMensageria({}, { ctwaClid: "AbC123-xyz", pageId: "P" }).ctwa_clid).toBe(
      "AbC123-xyz",
    );
  });
});

describe("conversion-dispatch usa a WABA", () => {
  const f = readFileSync("src/routes/api/public/cron/conversion-dispatch.ts", "utf8");
  it("monta mensageria com página OU WABA", () => {
    expect(f).toContain("(pagina?.page_id || contaWa?.waba_id)");
    expect(f).toContain("whatsappBusinessAccountId: contaWa?.waba_id ?? null");
    expect(f).toContain(".from('wa_accounts')");
  });
  it("só conta ativa", () => {
    expect(f).toContain(".eq('status', 'active')");
  });
});
