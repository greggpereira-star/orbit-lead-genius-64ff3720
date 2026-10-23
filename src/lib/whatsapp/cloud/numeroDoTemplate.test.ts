import { describe, expect, it } from "vitest";
import { numeroDoTemplate } from "./numeroDoTemplate";

type Linhas = Record<string, Array<Record<string, unknown>>>;

function banco(tabelas: Linhas, erroEm?: string) {
  const filtros: Array<{ t: string; f: unknown[][] }> = [];
  const db = {
    from(t: string) {
      const reg = { t, f: [] as unknown[][] };
      filtros.push(reg);
      let linhas = tabelas[t] ?? [];
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => (
          reg.f.push(["eq", c, v]),
          (linhas = linhas.filter((l) => l[c] === v)),
          q
        ),
        in: (c: string, v: unknown[]) => (
          reg.f.push(["in", c, v]),
          (linhas = linhas.filter((l) => v.includes(l[c]))),
          q
        ),
        order: () => q,
        then: (r: (v: unknown) => unknown) =>
          r(erroEm === t ? { data: null, error: { message: "x" } } : { data: linhas, error: null }),
      };
      return q;
    },
  };
  return { db, filtros };
}

const modelo = (account_id: string, extra: Record<string, unknown> = {}) => ({
  company_id: "c1",
  name: "hello_world",
  language: "en_US",
  status: "APPROVED",
  account_id,
  ...extra,
});
const numero = (id: string, account_id: string, extra: Record<string, unknown> = {}) => ({
  id,
  account_id,
  company_id: "c1",
  status: "active",
  receive_only: false,
  ...extra,
});
const pedido = { companyId: "c1", nome: "hello_world", idioma: "en_US" };

describe("numeroDoTemplate", () => {
  it("escolhe o número da conta em que o template está aprovado, não o mais antigo da empresa", async () => {
    const { db } = banco({
      wa_templates: [modelo("contaTeste")],
      // o mais antigo (Peticolé) vem primeiro, mas é de outra conta
      wa_phone_numbers: [numero("n-peticole", "contaPeticole"), numero("n-teste", "contaTeste")],
    });
    expect(await numeroDoTemplate(db, pedido)).toEqual({
      ok: true,
      numeroId: "n-teste",
      contaId: "contaTeste",
    });
  });

  it("template aprovado em duas contas: vale o primeiro número ativo entre elas", async () => {
    const { db } = banco({
      wa_templates: [modelo("a"), modelo("b")],
      wa_phone_numbers: [numero("n-a", "a"), numero("n-b", "b")],
    });
    const r = await numeroDoTemplate(db, pedido);
    expect(r).toMatchObject({ ok: true, numeroId: "n-a" });
  });

  it("com a conta escolhida na regra, só vale aquela conta", async () => {
    const { db } = banco({
      wa_templates: [modelo("a"), modelo("b")],
      wa_phone_numbers: [numero("n-a", "a"), numero("n-b", "b")],
    });
    expect(await numeroDoTemplate(db, { ...pedido, contaId: "b" })).toMatchObject({
      ok: true,
      numeroId: "n-b",
    });
  });

  it("só considera template APROVADO, da empresa, com o nome e o idioma certos", async () => {
    for (const errado of [
      modelo("a", { status: "PENDING" }),
      modelo("a", { company_id: "outra" }),
      modelo("a", { name: "outro" }),
      modelo("a", { language: "pt_BR" }),
    ]) {
      const { db } = banco({ wa_templates: [errado], wa_phone_numbers: [numero("n", "a")] });
      const r = await numeroDoTemplate(db, pedido);
      expect(r.ok).toBe(false);
    }
  });

  it("pula número apenas receptivo e número desconectado", async () => {
    const { db } = banco({
      wa_templates: [modelo("a")],
      wa_phone_numbers: [
        numero("n-rec", "a", { receive_only: true }),
        numero("n-off", "a", { status: "disconnected" }),
      ],
    });
    const r = await numeroDoTemplate(db, pedido);
    expect(r).toEqual({
      ok: false,
      texto: "Nenhum número ativo (e que envie) na conta do template.",
    });
    const { db: db2 } = banco({
      wa_templates: [modelo("a")],
      wa_phone_numbers: [numero("n-rec", "a", { receive_only: true }), numero("n-ok", "a")],
    });
    expect(await numeroDoTemplate(db2, pedido)).toMatchObject({ ok: true, numeroId: "n-ok" });
  });

  it("não acha o template: texto claro; erro do banco: texto claro e sem lançar", async () => {
    const { db } = banco({ wa_templates: [], wa_phone_numbers: [numero("n", "a")] });
    expect(await numeroDoTemplate(db, pedido)).toMatchObject({
      ok: false,
      texto: expect.stringContaining("não encontrado"),
    });
    const e1 = banco({ wa_templates: [modelo("a")] }, "wa_templates");
    expect(await numeroDoTemplate(e1.db, pedido)).toEqual({
      ok: false,
      texto: "Não consegui consultar os templates.",
    });
    const e2 = banco({ wa_templates: [modelo("a")], wa_phone_numbers: [] }, "wa_phone_numbers");
    expect(await numeroDoTemplate(e2.db, pedido)).toEqual({
      ok: false,
      texto: "Não consegui consultar os números.",
    });
  });

  it("os números consultados são só os ativos da empresa e das contas do template", async () => {
    const { db, filtros } = banco({
      wa_templates: [modelo("a")],
      wa_phone_numbers: [numero("n", "a")],
    });
    await numeroDoTemplate(db, pedido);
    const f = filtros.find((x) => x.t === "wa_phone_numbers")!.f;
    expect(f).toContainEqual(["eq", "company_id", "c1"]);
    expect(f).toContainEqual(["eq", "status", "active"]);
    expect(f).toContainEqual(["in", "account_id", ["a"]]);
  });
});
