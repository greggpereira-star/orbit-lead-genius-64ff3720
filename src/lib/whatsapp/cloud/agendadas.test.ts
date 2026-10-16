import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { criarDb } from "./dbFalso";

vi.mock("./envio", () => ({ enviarTextoNaConversa: vi.fn() }));
import { enviarTextoNaConversa } from "./envio";
import { despacharAgendadas, validarHorario } from "./agendadas";

const enviar = vi.mocked(enviarTextoNaConversa);
const m = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  conversation_id: "c1",
  body: "Oi, tudo bem?",
  created_by: "u1",
  attempts: 1,
  ...over,
});
const atualizacoes = (ops: Array<{ tabela: string; op: string; args: unknown[] }>) =>
  ops
    .filter((o) => o.tabela === "wa_scheduled_messages" && o.op === "update")
    .map((o) => o.args[0] as Record<string, unknown>);

beforeEach(() => enviar.mockReset());

describe("despacharAgendadas", () => {
  it("envia pelo caminho do atendente (política) e marca como enviada", async () => {
    enviar.mockResolvedValue({ ok: true, messageId: "x", providerMessageId: "w" });
    const { db, ops, rpcs } = criarDb({
      rpc: { reservar_mensagens_agendadas: { data: [m()] } },
    });
    const r = await despacharAgendadas(db);
    expect(r).toEqual({ reservadas: 1, enviadas: 1, falhas: 0, adiadas: 0 });
    expect(enviar).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ conversaId: "c1", origem: "agent", enviadoPor: "u1" }),
    );
    expect(atualizacoes(ops)[0]).toMatchObject({ status: "sent" });
    // Antes de reservar, libera quem ficou preso.
    expect(rpcs.map((x) => x.fn)).toEqual([
      "liberar_mensagens_agendadas_presas",
      "reservar_mensagens_agendadas",
    ]);
  });

  it("recusa de política (janela, opt-out) é definitiva: falha, sem nova tentativa", async () => {
    enviar.mockResolvedValue({
      ok: false,
      motivo: "fora_da_janela",
      texto: "A janela de 24h está fechada.",
    });
    const { db, ops } = criarDb({ rpc: { reservar_mensagens_agendadas: { data: [m()] } } });
    const r = await despacharAgendadas(db);
    expect(r).toMatchObject({ enviadas: 0, falhas: 1, adiadas: 0 });
    expect(atualizacoes(ops)[0]).toMatchObject({
      status: "failed",
      result: "A janela de 24h está fechada.",
    });
  });

  it("falha temporária do provedor volta à fila, adiada; esgotadas as tentativas, falha", async () => {
    enviar.mockResolvedValue({
      ok: false,
      motivo: "provedor",
      texto: "Meta fora",
      retentavel: true,
    });
    const a = criarDb({ rpc: { reservar_mensagens_agendadas: { data: [m({ attempts: 1 })] } } });
    expect(await despacharAgendadas(a.db)).toMatchObject({ adiadas: 1, falhas: 0 });
    const u = atualizacoes(a.ops)[0];
    expect(u.status).toBe("pending");
    expect(Date.parse(String(u.send_at))).toBeGreaterThan(Date.now() + 4 * 60_000);

    const b = criarDb({ rpc: { reservar_mensagens_agendadas: { data: [m({ attempts: 3 })] } } });
    expect(await despacharAgendadas(b.db)).toMatchObject({ adiadas: 0, falhas: 1 });
    expect(atualizacoes(b.ops)[0].status).toBe("failed");
  });

  it("exceção no envio não derruba o lote", async () => {
    enviar.mockRejectedValueOnce(new Error("rede"));
    enviar.mockResolvedValueOnce({ ok: true, messageId: "x", providerMessageId: "w" });
    const { db } = criarDb({
      rpc: { reservar_mensagens_agendadas: { data: [m({ id: "a" }), m({ id: "b" })] } },
    });
    const r = await despacharAgendadas(db);
    expect(r.reservadas).toBe(2);
    expect(r.enviadas).toBe(1);
  });

  it("sem a migração (RPC com erro) não faz nada e não lança", async () => {
    const { db } = criarDb({
      rpc: { reservar_mensagens_agendadas: { error: { message: "function does not exist" } } },
    });
    expect(await despacharAgendadas(db)).toEqual({
      reservadas: 0,
      enviadas: 0,
      falhas: 0,
      adiadas: 0,
    });
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe("validarHorario", () => {
  const agora = new Date("2026-10-16T12:00:00Z");
  it("aceita de 1 minuto a 30 dias", () => {
    expect(validarHorario("2026-10-16T12:05:00Z", agora)).toMatchObject({ ok: true });
    expect(validarHorario("2026-11-15T11:59:00Z", agora)).toMatchObject({ ok: true });
  });
  it("recusa passado, imediato, além de 30 dias e lixo", () => {
    for (const h of [
      "2026-10-16T11:00:00Z",
      "2026-10-16T12:00:30Z",
      "2026-11-16T12:00:00Z",
      "ontem",
    ])
      expect(validarHorario(h, agora).ok).toBe(false);
  });
});

describe("integração no sistema", () => {
  const server = readFileSync("src/lib/whatsapp-atendimento.functions.ts", "utf8");
  const f = (nome: string) => {
    const i = server.indexOf(`export const ${nome}`);
    const j = server.indexOf("\nexport const ", i + 10);
    return server.slice(i, j === -1 ? undefined : j);
  };

  it("agendar confere papel, empresa, horário e teto por conversa", () => {
    const g = f("agendarMensagemWhatsApp");
    expect(g).toContain("empresaParaAtender(admin, context.userId)");
    expect(g).toContain("conferirConversa(admin, companyId, data.conversaId)");
    expect(g).toContain("validarHorario(data.enviarEm)");
    expect(g).toContain("LIMITES_DO_AGENDAMENTO.pendentesPorConversa");
  });

  it("cancelar só mexe no que está pendente e é da empresa", () => {
    const g = f("cancelarMensagemAgendadaWhatsApp");
    expect(g).toContain('.eq("company_id", companyId)');
    expect(g).toContain('.eq("status", "pending")');
  });

  it("o cron que já roda a cada minuto também despacha as agendadas", () => {
    const rota = readFileSync("src/routes/api/public/cron/automation-dispatch.ts", "utf8");
    expect(rota).toContain("despacharAgendadas(admin)");
    // antes do retorno antecipado de "sem jobs"
    expect(rota.indexOf("despacharAgendadas(admin)")).toBeLessThan(
      rota.indexOf("if (!pendentes.length)"),
    );
  });

  it("o despacho usa o MESMO envio do atendente (opt-out e janela valem)", () => {
    const fonte = readFileSync("src/lib/whatsapp/cloud/agendadas.ts", "utf8");
    expect(fonte).toContain("enviarTextoNaConversa(db, {");
    expect(fonte).toContain('origem: "agent"');
  });
});
