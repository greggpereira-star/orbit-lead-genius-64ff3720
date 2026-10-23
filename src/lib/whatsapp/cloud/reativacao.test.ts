import { describe, expect, it } from "vitest";
import { pedeParaParar, pedeParaVoltar } from "./optout";
import { reativarContato } from "./reativacao";

describe("pedeParaVoltar", () => {
  it.each([
    "voltar",
    "VOLTAR",
    "Start",
    "reativar",
    "quero receber",
    " Quero voltar a receber! ",
    "voltar por favor.",
  ])("%j volta", (t) => expect(pedeParaVoltar(t)).toBe(true));
  it.each([
    "quero voltar amanhã",
    "vou voltar às 18h",
    "start de novo o pedido",
    "não quero receber",
    "",
    null,
    undefined,
  ])("%j não volta (só a mensagem inteira vale)", (t) => expect(pedeParaVoltar(t)).toBe(false));
  it("não confunde com o pedido de parada", () => {
    expect(pedeParaParar("voltar")).toBe(false);
    expect(pedeParaVoltar("parar")).toBe(false);
  });
});

function banco(erroEm?: string) {
  const chamadas: Array<{ t: string; op: string; filtros: unknown[][] }> = [];
  const db = {
    from(t: string) {
      const c = { t, op: "", filtros: [] as unknown[][] };
      chamadas.push(c);
      const q: any = {
        update: () => ((c.op = "update"), q),
        delete: () => ((c.op = "delete"), q),
        eq: (...a: unknown[]) => (c.filtros.push(["eq", ...a]), q),
        in: (...a: unknown[]) => {
          c.filtros.push(["in", ...a]);
          return Promise.resolve({ error: erroEm === t ? { message: "x" } : null });
        },
        then: (r: (v: unknown) => unknown) => r({ error: erroEm === t ? { message: "x" } : null }),
      };
      return q;
    },
  };
  return { db, chamadas };
}

describe("reativarContato", () => {
  it("limpa o contato E a lista de opt-out, só da empresa", async () => {
    const { db, chamadas } = banco();
    const r = await reativarContato(db, { companyId: "c1", waId: "5527992634480" });
    expect(r.ok).toBe(true);
    expect(chamadas.map((c) => `${c.t}:${c.op}`)).toEqual([
      "wa_contacts:update",
      "whatsapp_optouts:delete",
    ]);
    expect(chamadas[0].filtros).toContainEqual(["eq", "company_id", "c1"]);
    expect(chamadas[1].filtros).toContainEqual(["eq", "company_id", "c1"]);
    const emFones = chamadas[1].filtros.find((f) => f[0] === "in");
    expect(emFones?.[2]).toContain("5527992634480");
  });
  it("erro em qualquer etapa devolve texto em português e não finge sucesso", async () => {
    for (const t of ["wa_contacts", "whatsapp_optouts"]) {
      const { db } = banco(t);
      const r = await reativarContato(db, { companyId: "c1", waId: "5527992634480" });
      expect(r).toEqual({ ok: false, texto: "Não consegui reativar o contato." });
    }
  });
});
