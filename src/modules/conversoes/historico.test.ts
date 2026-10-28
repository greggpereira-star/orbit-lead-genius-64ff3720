import { describe, expect, it } from "vitest";
import {
  avisoDeReenvio,
  destinosDoEnvio,
  explicarFalha,
  podeReenviar,
  resumirEnvios,
} from "./historico";

const agora = new Date("2026-10-27T12:00:00Z");

describe("destinosDoEnvio", () => {
  it("lê Meta enviada e Google que falhou", () => {
    const d = destinosDoEnvio({
      status: "failed",
      meta_result: { status: "sent", http: 200 },
      google_result: { status: "falhou", detalhe: "lead sem identificador de clique (gclid/wbraid/gbraid) e sem contato" },
      label_result: null,
    });
    expect(d.map((x) => [x.destino, x.resultado])).toEqual([
      ["Meta", "enviado"],
      ["Google", "falhou"],
    ]);
    expect(d[1].detalhe).toMatch(/identificador de clique/);
  });

  it("usa a mensagem do corpo de erro da Meta, e cai para o código", () => {
    const comCorpo = destinosDoEnvio({
      status: "failed",
      meta_result: { status: "failed", http: 400, erro: "meta_http_400", resposta: { error: { message: "Invalid parameter" } } },
      google_result: null,
      label_result: null,
    });
    expect(comCorpo[0].detalhe).toBe("Invalid parameter");
    const semCorpo = destinosDoEnvio({
      status: "failed",
      meta_result: { status: "failed", erro: "fetch failed" },
      google_result: null,
      label_result: null,
    });
    expect(semCorpo[0].detalhe).toBe("fetch failed");
  });

  it("destino sem configuração aparece como não configurado", () => {
    const d = destinosDoEnvio({ status: "sent", meta_result: { status: "sent" }, google_result: null, label_result: null });
    expect(d.find((x) => x.destino === "Google")?.resultado).toBe("nao_configurado");
  });

  it("ignorado mostra o motivo gravado", () => {
    const d = destinosDoEnvio({
      status: "skipped",
      meta_result: { motivo: "mapeamento removido ou desligado" },
      google_result: null,
      label_result: null,
    });
    expect(d).toEqual([{ destino: "Meta", resultado: "pulado", detalhe: "mapeamento removido ou desligado" }]);
  });

  it("ensaio vira ensaio, não envio", () => {
    const d = destinosDoEnvio({ status: "rehearsal", meta_result: { status: "rehearsal" }, google_result: { status: "ensaio" }, label_result: null });
    expect(d.every((x) => x.resultado === "ensaio")).toBe(true);
  });
});

describe("explicarFalha", () => {
  it("reconhece o subcódigo 2804116 da Meta", () => {
    const e = explicarFalha("Meta", "x", { http: 400, resposta: { error: { error_subcode: 2804116 } } });
    expect(e.resumo).toMatch(/página|WhatsApp Business/);
    expect(e.adiantaReenviar).toBe(false);
  });
  it("401 é token; 5xx adianta reenviar", () => {
    expect(explicarFalha("Meta", null, { http: 401 }).resumo).toMatch(/token/);
    expect(explicarFalha("Meta", null, { http: 503 }).adiantaReenviar).toBe(true);
  });
  it("Google sem clique não adianta reenviar", () => {
    const e = explicarFalha("Google", "lead sem identificador de clique (gclid/wbraid/gbraid) e sem contato");
    expect(e.adiantaReenviar).toBe(false);
  });
  it("rede adianta reenviar nos dois", () => {
    expect(explicarFalha("Meta", "fetch failed").adiantaReenviar).toBe(true);
    expect(explicarFalha("Google", "network error").adiantaReenviar).toBe(true);
  });
  it("etiqueta nunca afeta a conversão", () => {
    expect(explicarFalha("Etiqueta", "x").sugestao).toMatch(/Não afeta a conversão/);
  });
});

describe("reenvio", () => {
  it("só falha e ensaio voltam para a fila", () => {
    expect(["failed", "rehearsal"].every((s) => podeReenviar({ status: s }))).toBe(true);
    expect(["sent", "pending", "skipped"].some((s) => podeReenviar({ status: s }))).toBe(false);
  });
  it("avisa quando a Meta vai recusar por idade", () => {
    const velho = { occurred_at: "2026-10-10T12:00:00Z", meta_result: { status: "failed" } };
    expect(avisoDeReenvio(velho, agora)).toMatch(/17 dias/);
    const novo = { occurred_at: "2026-10-25T12:00:00Z", meta_result: { status: "failed" } };
    expect(avisoDeReenvio(novo, agora)).toBeNull();
  });
  it("sem Meta configurada não há aviso de idade", () => {
    expect(avisoDeReenvio({ occurred_at: "2026-01-01T00:00:00Z", meta_result: null }, agora)).toBeNull();
  });
});

describe("resumirEnvios", () => {
  it("conta por estado", () => {
    const r = resumirEnvios([{ status: "sent" }, { status: "sent" }, { status: "failed" }, { status: "rehearsal" }, { status: "pending" }, { status: "skipped" }]);
    expect(r).toEqual({ total: 6, enviados: 2, falhas: 1, ensaios: 1, naFila: 1, ignorados: 1 });
  });
});
