import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verificarAssinatura } from "./assinatura.server";
import { postarAssinado } from "./entrega.server";

const base = {
  url: new URL("https://destino.exemplo.com/hook"),
  segredo: "whsec_teste",
  evento: "lead.created",
  entregaId: "d1",
  eventId: "e1",
  payload: { id: "e1", type: "lead.created", data: { lead: { name: "Ana" } } },
  tentativa: 1,
};

function falso(resposta: () => Response | Promise<Response>) {
  const chamadas: { url: unknown; init: RequestInit }[] = [];
  const buscar = (async (url: unknown, init: RequestInit) => {
    chamadas.push({ url, init });
    return resposta();
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

describe("postarAssinado", () => {
  it("envia o corpo assinado que o destinatário consegue verificar", async () => {
    const f = falso(() => new Response("ok", { status: 200 }));
    const r = await postarAssinado(base, { buscar: f.buscar, agoraEmSegundos: 1_800_000_000 });
    expect(r).toEqual({ ok: true, status: 200, erro: null });

    const { init } = f.chamadas[0];
    const h = init.headers as Record<string, string>;
    expect(
      verificarAssinatura(
        h["x-leadflow-signature"],
        "whsec_teste",
        String(init.body),
        1_800_000_000,
      ),
    ).toBe(true);
    expect(h["x-leadflow-event"]).toBe("lead.created");
    expect(h["x-leadflow-event-id"]).toBe("e1");
    expect(h["x-leadflow-delivery"]).toBe("d1");
    expect(init.method).toBe("POST");
  });

  it("nunca segue redirecionamento", async () => {
    const f = falso(
      () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }),
    );
    const r = await postarAssinado(base, { buscar: f.buscar });
    expect(f.chamadas[0].init.redirect).toBe("manual");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(302);
    expect(f.chamadas).toHaveLength(1);
  });

  it("5xx e 4xx são falha com o status registrado", async () => {
    for (const status of [400, 404, 500, 503]) {
      const f = falso(() => new Response("x", { status }));
      const r = await postarAssinado(base, { buscar: f.buscar });
      expect(r.ok).toBe(false);
      expect(r.status).toBe(status);
    }
  });

  it("erro de rede e timeout viram falha com mensagem, sem vazar a exceção", async () => {
    const rede = await postarAssinado(base, {
      buscar: (async () => {
        throw new TypeError("fetch failed: ECONNREFUSED 10.0.0.5:443");
      }) as unknown as typeof fetch,
    });
    expect(rede).toEqual({ ok: false, status: null, erro: "falha de conexão com o destino" });
    expect(rede.erro).not.toContain("10.0.0.5");

    const tempo = await postarAssinado(base, {
      buscar: (async () => {
        const e = new Error("timeout");
        e.name = "TimeoutError";
        throw e;
      }) as unknown as typeof fetch,
    });
    expect(tempo.erro).toBe("sem resposta em 8s");
  });

  it("2xx de qualquer tipo conta como entregue (201, 204)", async () => {
    for (const status of [200, 201, 202, 204]) {
      const f = falso(() => new Response(null, { status }));
      expect((await postarAssinado(base, { buscar: f.buscar })).ok).toBe(true);
    }
  });
});

describe("despachante — regras no código", () => {
  const src = readFileSync("src/lib/webhooks/entrega.server.ts", "utf8");
  it("revalida o destino a cada envio e confere o plano", () => {
    expect(src).toContain("(deps.validar ?? validarDestinoDeWebhook)(ep.url)");
    expect(src).toContain('temRecurso(admin, ep.company_id, "webhooks_assinados")');
  });
  it("a conferência de destino e de plano vem antes do POST", () => {
    const corpo = src.slice(src.indexOf("async function processarUma"));
    expect(corpo.indexOf("deps.validar ??")).toBeLessThan(corpo.indexOf("deps.postar ??"));
    expect(corpo.indexOf("temRecurso(")).toBeLessThan(corpo.indexOf("deps.postar ??"));
  });
  it("a rota de cron exige autorização antes de tocar no banco", () => {
    const rota = readFileSync("src/routes/api/public/cron/webhook-dispatch.ts", "utf8");
    expect(rota.indexOf("autorizarCron(")).toBeLessThan(rota.indexOf("supabaseAdmin"));
  });
});
