/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { acaoCriarTarefa, prazoEmHoras } from "./acaoCriarTarefa";

/** Banco falso: devolve linhas por tabela e registra o que foi inserido. */
function db(opts: {
  equipe?: string[];
  leadResponsavel?: string | null;
  leadDaEmpresa?: boolean;
  erroNoInsert?: string;
}) {
  const inseridos: any[] = [];
  const f = {
    from(tabela: string) {
      const filtros: Array<[string, unknown]> = [];
      const q: any = {
        select: () => q,
        eq: (k: string, v: unknown) => (filtros.push([k, v]), q),
        insert: (linha: unknown) => {
          inseridos.push({ tabela, linha });
          return Promise.resolve({
            error: opts.erroNoInsert ? { message: opts.erroNoInsert } : null,
          });
        },
        maybeSingle: () => {
          if (tabela === "memberships") {
            const u = filtros.find(([k]) => k === "user_id")?.[1] as string;
            return Promise.resolve({
              data: (opts.equipe ?? []).includes(u) ? { user_id: u } : null,
            });
          }
          if (tabela === "leads") {
            // duas consultas: assigned_to e a conferência da empresa
            return Promise.resolve({
              data:
                opts.leadDaEmpresa === false
                  ? null
                  : { id: "l1", assigned_to: opts.leadResponsavel ?? null },
            });
          }
          return Promise.resolve({ data: null });
        },
      };
      return q;
    },
  };
  return { db: f, inseridos };
}

const job = (payload: Record<string, unknown> | null = {}, lead: string | null = "l1") => ({
  company_id: "emp",
  lead_id: lead,
  payload,
});
const agora = new Date("2026-10-24T12:00:00Z");

describe("ação Criar tarefa", () => {
  it("cria a anotação com prazo, responsável da conversa e autor 'Automação'", async () => {
    const { db: d, inseridos } = db({ equipe: ["u2"] });
    const r = await acaoCriarTarefa(
      d,
      job({ nome: "Ana", responsavel_id: "u2" }),
      { texto: "Ligar para {{nome}}", prazo_horas: 2 },
      agora,
    );
    expect(r).toEqual({ acao: "criar_tarefa", status: "ok", detalhe: "prazo em 2 h" });
    expect(inseridos).toHaveLength(1);
    expect(inseridos[0].tabela).toBe("lead_notes");
    expect(inseridos[0].linha).toMatchObject({
      company_id: "emp",
      lead_id: "l1",
      author_id: null,
      author_name: "Automação",
      body: "Ligar para Ana",
      assigned_to: "u2",
      scheduled_for: "2026-10-24T14:00:00.000Z",
    });
  });

  it("sem responsável na conversa usa o do lead; pessoa fixa da regra vence os dois", async () => {
    const a = db({ equipe: ["u3"], leadResponsavel: "u3" });
    await acaoCriarTarefa(a.db, job({}), {}, agora);
    expect(a.inseridos[0].linha.assigned_to).toBe("u3");
    expect(a.inseridos[0].linha.body).toBe("Retomar o contato"); // sem nome no evento: sem "com" solto

    const b = db({ equipe: ["u5", "u2"] });
    await acaoCriarTarefa(
      b.db,
      job({ responsavel_id: "u2" }),
      { destino: "usuario", user_id: "u5" },
      agora,
    );
    expect(b.inseridos[0].linha.assigned_to).toBe("u5");
  });

  it("ninguém para fazer: pulada, e NÃO cria tarefa sem dono", async () => {
    const { db: d, inseridos } = db({ equipe: [] });
    const r = await acaoCriarTarefa(d, job({}), {}, agora);
    expect(r).toMatchObject({ status: "pulada", detalhe: "nenhum responsável resolvido" });
    expect(inseridos).toHaveLength(0);
  });

  it("responsável que não é da empresa: falha; lead de outra empresa: falha", async () => {
    const x = db({ equipe: [] });
    expect(
      (await acaoCriarTarefa(x.db, job({ responsavel_id: "intruso" }), {}, agora)).detalhe,
    ).toBe("responsável não é da empresa");
    const y = db({ equipe: ["u2"], leadDaEmpresa: false });
    expect((await acaoCriarTarefa(y.db, job({ responsavel_id: "u2" }), {}, agora)).detalhe).toBe(
      "lead não é desta empresa",
    );
    expect(y.inseridos).toHaveLength(0);
  });

  it("evento sem lead: pulada", async () => {
    const { db: d, inseridos } = db({});
    expect(await acaoCriarTarefa(d, job({}, null), {}, agora)).toMatchObject({
      status: "pulada",
      detalhe: "sem lead",
    });
    expect(inseridos).toHaveLength(0);
  });

  it("erro do banco vira falha", async () => {
    const { db: d } = db({ equipe: ["u2"], erroNoInsert: "boom" });
    expect(await acaoCriarTarefa(d, job({ responsavel_id: "u2" }), {}, agora)).toMatchObject({
      status: "falhou",
      detalhe: "boom",
    });
  });

  it("prazo em horas: padrão 24, mínimo 1, máximo 720", () => {
    expect(prazoEmHoras(undefined)).toBe(24);
    expect(prazoEmHoras("abc")).toBe(24);
    expect(prazoEmHoras(0)).toBe(24);
    expect(prazoEmHoras(1)).toBe(1);
    expect(prazoEmHoras(6.9)).toBe(6);
    expect(prazoEmHoras(100000)).toBe(720);
  });
});
