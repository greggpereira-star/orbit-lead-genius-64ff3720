import { describe, expect, it, vi } from "vitest";
import { registrarMencoes, validarResponsavel } from "./equipe";

type Op = { tabela: string; filtros: Array<[string, unknown]>; insert?: unknown };

/** Banco falso: registra o que foi consultado/inserido e devolve as linhas combinadas. */
function dbFalso(membros: Array<{ user_id: string; role?: string }>) {
  const ops: Op[] = [];
  const db = {
    from(tabela: string) {
      const op: Op = { tabela, filtros: [] };
      ops.push(op);
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => (op.filtros.push([c, v]), q),
        in: (c: string, v: unknown) => (op.filtros.push([c, v]), q),
        insert: (linhas: unknown) => ((op.insert = linhas), Promise.resolve({ error: null })),
        maybeSingle: () => {
          const uid = op.filtros.find(([c]) => c === "user_id")?.[1];
          return Promise.resolve({ data: membros.find((m) => m.user_id === uid) ?? null });
        },
        then: (ok: (v: unknown) => unknown) => {
          const alvos = (op.filtros.find(([c]) => c === "user_id")?.[1] as string[]) ?? [];
          return Promise.resolve({ data: membros.filter((m) => alvos.includes(m.user_id)) }).then(
            ok,
          );
        },
      };
      return q;
    },
  };
  return { db, ops };
}

const base = { companyId: "emp", conversaId: "conv", notaId: "nota", autorId: "eu" };

describe("registrarMencoes", () => {
  it("não menciona a si mesmo e não consulta nada se sobrar ninguém", async () => {
    const { db, ops } = dbFalso([{ user_id: "eu" }]);
    const seguir = vi.fn();
    const r = await registrarMencoes(db, { ...base, mencionar: ["eu"], seguir });
    expect(r.mencionados).toEqual([]);
    expect(ops).toHaveLength(0);
    expect(seguir).not.toHaveBeenCalled();
  });

  it("sem lista de menções não faz nada", async () => {
    const { db, ops } = dbFalso([]);
    const r = await registrarMencoes(db, { ...base, mencionar: undefined, seguir: vi.fn() });
    expect(r.mencionados).toEqual([]);
    expect(ops).toHaveLength(0);
  });

  it("só grava quem é membro da empresa, sem duplicar, e faz o mencionado seguir", async () => {
    const { db, ops } = dbFalso([{ user_id: "ana" }]);
    const seguir = vi.fn().mockResolvedValue(undefined);
    const r = await registrarMencoes(db, {
      ...base,
      mencionar: ["ana", "ana", "intruso", "eu"],
      seguir,
    });
    expect(r.mencionados).toEqual(["ana"]);
    // a consulta é escopada na empresa e pede só os alvos únicos, sem o autor
    expect(ops[0].filtros).toContainEqual(["company_id", "emp"]);
    expect(ops[0].filtros).toContainEqual(["user_id", ["ana", "intruso"]]);
    expect(ops[1].tabela).toBe("wa_mentions");
    expect(ops[1].insert).toEqual([
      {
        company_id: "emp",
        conversation_id: "conv",
        note_id: "nota",
        mentioned_user_id: "ana",
        author_id: "eu",
      },
    ]);
    expect(seguir).toHaveBeenCalledWith("ana");
  });

  it("ninguém é membro: não insere", async () => {
    const { db, ops } = dbFalso([]);
    const r = await registrarMencoes(db, { ...base, mencionar: ["x"], seguir: vi.fn() });
    expect(r.mencionados).toEqual([]);
    expect(ops.some((o) => o.tabela === "wa_mentions")).toBe(false);
  });

  it("falha ao seguir não derruba a nota", async () => {
    const { db } = dbFalso([{ user_id: "ana" }]);
    const seguir = vi.fn().mockRejectedValue(new Error("x"));
    await expect(registrarMencoes(db, { ...base, mencionar: ["ana"], seguir })).resolves.toEqual({
      mencionados: ["ana"],
    });
  });
});

describe("validarResponsavel", () => {
  it("desatribuir (null) sempre vale e não consulta", async () => {
    const { db, ops } = dbFalso([]);
    expect(await validarResponsavel(db, "emp", null)).toEqual({ ok: true });
    expect(ops).toHaveLength(0);
  });

  it("quem não é da empresa é recusado, consultando pela empresa", async () => {
    const { db, ops } = dbFalso([]);
    const r = await validarResponsavel(db, "emp", "fora");
    expect(r.ok).toBe(false);
    expect(ops[0].filtros).toContainEqual(["company_id", "emp"]);
  });

  it("viewer (somente leitura) é recusado", async () => {
    const { db } = dbFalso([{ user_id: "u", role: "viewer" }]);
    const r = await validarResponsavel(db, "emp", "u");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.texto).toMatch(/somente leitura/);
  });

  it.each(["owner", "admin", "member"])("%s é aceito", async (role) => {
    const { db } = dbFalso([{ user_id: "u", role }]);
    expect(await validarResponsavel(db, "emp", "u")).toEqual({ ok: true });
  });
});
