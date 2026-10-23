/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const enviar = vi.fn();
vi.mock("./acoesDeWhatsApp", () => ({ acaoEnviarWhatsApp: (...a: unknown[]) => enviar(...a) }));

import {
  acaoAvaliarAtendimento,
  acaoReabrirConversa,
  acaoResolverConversa,
} from "./acoesDeConversa";

/** Banco falso encadeável: registra update, filtros e devolve as linhas "afetadas". */
function db(opts: { afetadas?: Array<{ id: string }>; erro?: string } = {}) {
  const chamadas: Array<{
    tabela: string;
    update: unknown;
    filtros: Array<[string, string, unknown]>;
  }> = [];
  const f = {
    from(tabela: string) {
      const c = {
        tabela,
        update: undefined as unknown,
        filtros: [] as Array<[string, string, unknown]>,
      };
      chamadas.push(c);
      const q: any = {
        update: (v: unknown) => ((c.update = v), q),
        eq: (k: string, v: unknown) => (c.filtros.push(["eq", k, v]), q),
        neq: (k: string, v: unknown) => (c.filtros.push(["neq", k, v]), q),
        select: () =>
          Promise.resolve(
            opts.erro
              ? { data: null, error: { message: opts.erro } }
              : { data: opts.afetadas ?? [{ id: "c1" }], error: null },
          ),
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve(opts.erro ? { error: { message: opts.erro } } : { error: null }).then(ok),
      };
      return q;
    },
  };
  return { db: f, chamadas };
}

const job = (payload: Record<string, unknown> | null = { conversation_id: "c1" }) => ({
  company_id: "emp",
  lead_id: "l1",
  payload,
});

beforeEach(() => enviar.mockReset());

describe("resolver e reabrir conversa", () => {
  it("resolver: muda só quem NÃO está resolvida, escopado na empresa do job", async () => {
    const { db: d, chamadas } = db();
    const r = await acaoResolverConversa(d, job());
    expect(r).toEqual({ acao: "resolver_conversa", status: "ok" });
    expect(chamadas[0].update).toEqual({ status: "resolved" });
    expect(chamadas[0].filtros).toContainEqual(["eq", "id", "c1"]);
    expect(chamadas[0].filtros).toContainEqual(["eq", "company_id", "emp"]);
    expect(chamadas[0].filtros).toContainEqual(["neq", "status", "resolved"]);
  });

  it("reabrir: muda só quem ESTÁ resolvida", async () => {
    const { db: d, chamadas } = db();
    const r = await acaoReabrirConversa(d, job());
    expect(r.status).toBe("ok");
    expect(chamadas[0].update).toEqual({ status: "open" });
    expect(chamadas[0].filtros).toContainEqual(["eq", "status", "resolved"]);
  });

  it("nada a mudar: pulada com o motivo, não é falha", async () => {
    const { db: d } = db({ afetadas: [] });
    expect(await acaoResolverConversa(d, job())).toMatchObject({
      status: "pulada",
      detalhe: "já estava resolvida",
    });
    expect(await acaoReabrirConversa(d, job())).toMatchObject({
      status: "pulada",
      detalhe: "já estava aberta",
    });
  });

  it("evento sem conversa: pulada sem tocar no banco", async () => {
    const { db: d, chamadas } = db();
    expect(await acaoResolverConversa(d, job({ nome: "Ana" }))).toMatchObject({
      status: "pulada",
      detalhe: "sem conversa",
    });
    expect(await acaoReabrirConversa(d, job(null))).toMatchObject({ status: "pulada" });
    expect(chamadas).toHaveLength(0);
  });

  it("erro do banco vira falha", async () => {
    const { db: d } = db({ erro: "boom" });
    expect(await acaoResolverConversa(d, job())).toMatchObject({
      status: "falhou",
      detalhe: "boom",
    });
  });
});

describe("avaliar atendimento", () => {
  it("envia o texto padrão e marca a pesquisa como em aberto", async () => {
    enviar.mockResolvedValue({ acao: "enviar_whatsapp", status: "ok" });
    const { db: d, chamadas } = db();
    const r = await acaoAvaliarAtendimento(d, job(), {});
    expect(r).toEqual({ acao: "avaliar_atendimento", status: "ok" });
    expect(enviar.mock.calls[0][2].mensagem).toMatch(/nota de 1 \(ruim\) a 5 \(ótimo\)/);
    expect(enviar.mock.calls[0][3]).toBe("enviar_whatsapp");
    expect(chamadas[0].update).toMatchObject({ csat_score: null, csat_at: null });
    expect((chamadas[0].update as any).csat_requested_at).toBeTruthy();
    expect(chamadas[0].filtros).toContainEqual(["eq", "company_id", "emp"]);
  });

  it("usa o texto da regra quando há", async () => {
    enviar.mockResolvedValue({ acao: "enviar_whatsapp", status: "ok" });
    await acaoAvaliarAtendimento(db().db, job(), { mensagem: "  Nota de 1 a 5?  " });
    expect(enviar.mock.calls[0][2].mensagem).toBe("Nota de 1 a 5?");
  });

  it("envio pulado ou falho: NÃO marca pesquisa em aberto e repassa o motivo", async () => {
    enviar.mockResolvedValue({
      acao: "enviar_whatsapp",
      status: "pulada",
      detalhe: "Fora do horário",
    });
    const { db: d, chamadas } = db();
    const r = await acaoAvaliarAtendimento(d, job(), {});
    expect(r).toEqual({
      acao: "avaliar_atendimento",
      status: "pulada",
      detalhe: "Fora do horário",
    });
    expect(chamadas).toHaveLength(0);

    enviar.mockResolvedValue({ acao: "enviar_whatsapp", status: "falhou", detalhe: "131047" });
    expect((await acaoAvaliarAtendimento(d, job(), {})).status).toBe("falhou");
  });

  it("sem conversa: pulada, e não envia nada", async () => {
    const r = await acaoAvaliarAtendimento(db().db, job({}), {});
    expect(r).toMatchObject({ status: "pulada", detalhe: "sem conversa" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("enviou mas não conseguiu marcar: falha dizendo que o pedido saiu", async () => {
    enviar.mockResolvedValue({ acao: "enviar_whatsapp", status: "ok" });
    const r = await acaoAvaliarAtendimento(db({ erro: "x" }).db, job(), {});
    expect(r.status).toBe("falhou");
    expect(r.detalhe).toMatch(/pedido enviado/);
  });
});
