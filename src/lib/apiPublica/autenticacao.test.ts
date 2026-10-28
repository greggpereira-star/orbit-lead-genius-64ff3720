/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it } from "vitest";
import {
  LIMITE_POR_MINUTO,
  autenticarApi,
  lerJson,
  limparCacheDePlano,
  metodoNaoPermitido,
  segundosAteFimDaJanela,
} from "../apiPublica.server";
import { gerarChave, hashDaChave } from "./chaves.server";

interface Cenario {
  linha?: Record<string, unknown> | null;
  erroNaBusca?: boolean;
  contagem?: number | null;
  erroNoLimite?: boolean;
  plano?: boolean | "erro";
}

/** Admin falso que registra o que foi chamado, para provar a ORDEM das conferências. */
function falso(c: Cenario) {
  const chamadas: string[] = [];
  let hashBuscado = "";
  const consulta = (tabela: string) => {
    const b: any = {
      select: () => b,
      eq: (col: string, v: string) => {
        if (col === "hash") hashBuscado = v;
        return b;
      },
      or: () => b,
      update: () => {
        chamadas.push("marcar_uso");
        return b;
      },
      maybeSingle: async () => {
        chamadas.push(`buscar_${tabela}`);
        return c.erroNaBusca
          ? { data: null, error: { message: "x" } }
          : { data: c.linha ?? null, error: null };
      },
      then: (ok: any) => ok({ data: null, error: null }),
    };
    return b;
  };
  const admin = {
    from: consulta,
    rpc: async (nome: string) => {
      chamadas.push(nome);
      if (nome === "api_consumir_limite") {
        return c.erroNoLimite
          ? { data: null, error: { message: "x" } }
          : { data: c.contagem ?? 1, error: null };
      }
      if (nome === "tem_recurso") {
        return c.plano === "erro"
          ? { data: null, error: { message: "x" } }
          : { data: c.plano ?? true, error: null };
      }
      return { data: null, error: null };
    },
  };
  return { admin, chamadas, hash: () => hashBuscado };
}

const linhaValida = (extra: Record<string, unknown> = {}) => ({
  id: "k1",
  company_id: "c1",
  nome: "Minha chave",
  escopos: ["leads:read"],
  expira_em: null,
  revogada_em: null,
  ...extra,
});
const req = (chave?: string) =>
  new Request("https://x.test/api/public/v1/leads", {
    headers: chave ? { authorization: `Bearer ${chave}` } : {},
  });

beforeEach(() => limparCacheDePlano());

describe("autenticarApi", () => {
  it("sem chave: 401 e nada é consultado", async () => {
    const f = falso({});
    const r = await autenticarApi(req(), f.admin, "leads:read");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.resposta.status).toBe(401);
    expect(f.chamadas).toEqual([]);
  });

  it("busca pelo HASH, nunca pela chave", async () => {
    const { chave } = gerarChave();
    const f = falso({ linha: linhaValida() });
    await autenticarApi(req(chave), f.admin, "leads:read");
    expect(f.hash()).toBe(hashDaChave(chave));
    expect(f.hash()).not.toBe(chave);
  });

  it("desconhecida, revogada e vencida dão a MESMA resposta", async () => {
    const { chave } = gerarChave();
    const corpos: string[] = [];
    for (const linha of [
      null,
      linhaValida({ revogada_em: new Date().toISOString() }),
      linhaValida({ expira_em: new Date(Date.now() - 1000).toISOString() }),
    ]) {
      const f = falso({ linha });
      const r = await autenticarApi(req(chave), f.admin, "leads:read");
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.resposta.status).toBe(401);
        corpos.push(await r.resposta.text());
      }
      expect(f.chamadas).not.toContain("api_consumir_limite"); // chave inválida não gasta limite nem consulta plano
    }
    expect(new Set(corpos).size).toBe(1);
  });

  it("falha de infraestrutura NEGA (503), não libera", async () => {
    const { chave } = gerarChave();
    for (const c of [
      { erroNaBusca: true },
      { linha: linhaValida(), erroNoLimite: true },
    ] as Cenario[]) {
      const r = await autenticarApi(req(chave), falso(c).admin, "leads:read");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.resposta.status).toBe(503);
    }
  });

  it("acima do limite: 429 com Retry-After, ANTES de consultar o plano", async () => {
    const { chave } = gerarChave();
    const f = falso({ linha: linhaValida(), contagem: LIMITE_POR_MINUTO + 1 });
    const r = await autenticarApi(req(chave), f.admin, "leads:read");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.resposta.status).toBe(429);
      expect(Number(r.resposta.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    }
    expect(f.chamadas).not.toContain("tem_recurso");
  });

  it("no limite exato ainda passa", async () => {
    const { chave } = gerarChave();
    const r = await autenticarApi(
      req(chave),
      falso({ linha: linhaValida(), contagem: LIMITE_POR_MINUTO }).admin,
      "leads:read",
    );
    expect(r.ok).toBe(true);
  });

  it("plano sem o recurso: 403; erro ao consultar o plano também nega", async () => {
    const { chave } = gerarChave();
    for (const plano of [false, "erro"] as const) {
      limparCacheDePlano();
      const r = await autenticarApi(
        req(chave),
        falso({ linha: linhaValida(), plano }).admin,
        "leads:read",
      );
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.resposta.status).toBe(403);
        expect((await r.resposta.json()).error.code).toBe("feature_not_available");
      }
    }
  });

  it("escopo insuficiente: 403 insufficient_scope; escrever não implica ler", async () => {
    const { chave } = gerarChave();
    const r = await autenticarApi(
      req(chave),
      falso({ linha: linhaValida({ escopos: ["leads:write"] }) }).admin,
      "leads:read",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect((await r.resposta.json()).error.code).toBe("insufficient_scope");
  });

  it("chave boa devolve a empresa DA CHAVE", async () => {
    const { chave } = gerarChave();
    const r = await autenticarApi(req(chave), falso({ linha: linhaValida() }).admin, "leads:read");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.ctx).toMatchObject({ companyId: "c1", keyId: "k1", keyNome: "Minha chave" });
  });

  it("o plano fica em cache por 30 s (uma consulta, não uma por requisição)", async () => {
    const { chave } = gerarChave();
    const f = falso({ linha: linhaValida() });
    await autenticarApi(req(chave), f.admin, "leads:read");
    await autenticarApi(req(chave), f.admin, "leads:read");
    await autenticarApi(req(chave), f.admin, "leads:read");
    expect(f.chamadas.filter((c) => c === "tem_recurso")).toHaveLength(1);
  });
});

describe("lerJson", () => {
  const post = (corpo: BodyInit, cab: Record<string, string> = {}) =>
    new Request("https://x.test/", { method: "POST", body: corpo, headers: cab });

  it("lê JSON válido", async () => {
    const r = await lerJson(post(JSON.stringify({ a: 1 })));
    expect(r).toEqual({ ok: true, valor: { a: 1 } });
  });
  it("JSON inválido ou vazio: 400", async () => {
    for (const corpo of ["{não", ""]) {
      const r = await lerJson(post(corpo));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.resposta.status).toBe(400);
    }
  });
  it("corpo maior que o teto: 413, mesmo sem Content-Length", async () => {
    const r = await lerJson(post("x".repeat(100)), 50);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.resposta.status).toBe(413);
  });
  it("para de ler assim que passa do teto (corpo em partes não é lido inteiro)", async () => {
    let lidos = 0;
    const fluxo = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        lidos++;
        ctrl.enqueue(new Uint8Array(40));
        if (lidos > 1000) ctrl.close();
      },
    });
    const r = await lerJson(
      new Request("https://x.test/", {
        method: "POST",
        body: fluxo,
        duplex: "half",
      } as RequestInit),
      100,
    );
    expect(r.ok).toBe(false);
    expect(lidos).toBeLessThan(10);
  });
  it("Content-Length declarado acima do teto recusa sem ler o corpo", async () => {
    // O `Request` do Node não aceita definir Content-Length (cabeçalho proibido);
    // num servidor real ele chega pronto. Aqui, uma requisição simulada.
    let leu = false;
    const simulada = {
      headers: new Headers({ "content-length": "999999" }),
      get body() {
        leu = true;
        return null;
      },
    } as unknown as Request;
    const r = await lerJson(simulada, 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.resposta.status).toBe(413);
    expect(leu).toBe(false);
  });
});

describe("auxiliares", () => {
  it("405 traz Allow", async () => {
    const r = metodoNaoPermitido("GET, POST");
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("GET, POST");
  });
  it("Retry-After vai de 1 a 60", () => {
    expect(segundosAteFimDaJanela(0)).toBe(60);
    expect(segundosAteFimDaJanela(59_999)).toBe(1);
  });
});
