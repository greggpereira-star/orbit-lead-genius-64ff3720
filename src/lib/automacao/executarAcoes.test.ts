import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { executarAcoes, type AcaoDoJob, type ResultadoDeAcao } from "./executarAcoes";

const acoes: AcaoDoJob[] = [
  { id: "a1", action_type: "enviar_template", sort_order: 0 },
  { id: "a2", action_type: "mover_etapa", sort_order: 1 },
];

describe("executarAcoes", () => {
  it("primeira tentativa executa todas, na ordem", async () => {
    const ordem: string[] = [];
    const r = await executarAcoes(acoes, null, async (a) => {
      ordem.push(a.id);
      return { acao: a.action_type, status: "ok" };
    });
    expect(ordem).toEqual(["a1", "a2"]);
    expect(r).toMatchObject({ algumaFalhou: false, executadas: 2 });
    expect(r.resultados.map((x) => x.id)).toEqual(["a1", "a2"]);
  });

  it("RETENTATIVA não repete o que já deu certo — a mensagem não sai de novo", async () => {
    const anteriores: ResultadoDeAcao[] = [
      { id: "a1", acao: "enviar_template", status: "ok", detalhe: "5527…" },
      { id: "a2", acao: "mover_etapa", status: "falhou", detalhe: "timeout" },
    ];
    const exec = vi.fn(async (a: AcaoDoJob) => ({ acao: a.action_type, status: "ok" as const }));
    const r = await executarAcoes(acoes, anteriores, exec);
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls[0][0].id).toBe("a2");
    expect(r.algumaFalhou).toBe(false);
    // o resultado da ação já feita é preservado (auditável), não apagado
    expect(r.resultados[0]).toMatchObject({ id: "a1", status: "ok", detalhe: "5527…" });
  });

  it("'pulada' é decisão e também não se repete (opt-out, fora do horário)", async () => {
    const exec = vi.fn(async (a: AcaoDoJob) => ({ acao: a.action_type, status: "ok" as const }));
    await executarAcoes(
      acoes,
      [
        {
          id: "a1",
          acao: "enviar_template",
          status: "pulada",
          detalhe: "Contato pediu para não receber mensagens",
        },
      ],
      exec,
    );
    expect(exec.mock.calls.map((c) => c[0].id)).toEqual(["a2"]);
  });

  it("o que FALHOU é tentado de novo", async () => {
    const exec = vi.fn(async (a: AcaoDoJob) => ({ acao: a.action_type, status: "ok" as const }));
    await executarAcoes(acoes, [{ id: "a1", acao: "x", status: "falhou" }], exec);
    expect(exec.mock.calls.map((c) => c[0].id)).toEqual(["a1", "a2"]);
  });

  it("resultado antigo sem id (formato anterior) não é aproveitado", async () => {
    const exec = vi.fn(async (a: AcaoDoJob) => ({ acao: a.action_type, status: "ok" as const }));
    await executarAcoes(
      acoes,
      [{ acao: "enviar_template", status: "ok" } as unknown as ResultadoDeAcao],
      exec,
    );
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it("falha persistente é reportada", async () => {
    const r = await executarAcoes(acoes, null, async (a) =>
      a.id === "a2"
        ? { acao: a.action_type, status: "falhou", detalhe: "x" }
        : { acao: a.action_type, status: "ok" },
    );
    expect(r.algumaFalhou).toBe(true);
  });

  it("anteriores em formato inesperado não derrubam", async () => {
    const r = await executarAcoes(acoes, "lixo" as unknown as ResultadoDeAcao[], async (a) => ({
      acao: a.action_type,
      status: "ok",
    }));
    expect(r.executadas).toBe(2);
  });
});

describe("o despachante usa a execução sem repetição", () => {
  const f = readFileSync("src/routes/api/public/cron/automation-dispatch.ts", "utf8");
  it("passa o resultado da tentativa anterior", () => {
    expect(f).toContain("executarAcoes((acoes ?? []) as Acao[], job.resultado,");
    expect(f).toContain("resultado?: ResultadoDeAcao[] | null;");
    expect(f).toMatch(
      /\.select\('id, company_id, rule_id, trigger_event, lead_id, payload, attempts, resultado'\)/,
    );
  });
  it("não há mais laço que roda tudo a cada tentativa", () => {
    expect(f).not.toContain("resultados.push(await executar(admin, job, acao))");
  });
});
