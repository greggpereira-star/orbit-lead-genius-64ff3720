import { describe, expect, it } from "vitest";
import { MENSAGEM_SEM_PERMISSAO, fetchComErroDePermissao, traduzirErroDePermissao } from "./erroDePermissao";

const REST = "https://api.exemplo/rest/v1/leads";
const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

describe("erro de permissão do banco vira texto de gente", () => {
  it("troca a mensagem do 42501 e mantém o resto do corpo e o status", async () => {
    const r = await traduzirErroDePermissao(REST, resp(403, { code: "42501", message: 'new row violates row-level security policy for table "leads"', details: null }));
    const j = await r.json();
    expect(r.status).toBe(403);
    expect(j.message).toBe(MENSAGEM_SEM_PERMISSAO);
    expect(j.code).toBe("42501");
  });
  it("vale também para 401 com 42501 (permission denied for table)", async () => {
    const r = await traduzirErroDePermissao(REST, resp(401, { code: "42501", message: "permission denied for table audit_logs" }));
    expect((await r.json()).message).toBe(MENSAGEM_SEM_PERMISSAO);
  });
  it("não mexe em sessão expirada, em outros códigos, em sucesso nem fora do PostgREST", async () => {
    const jwt = await traduzirErroDePermissao(REST, resp(401, { code: "PGRST301", message: "JWT expired" }));
    expect((await jwt.json()).message).toBe("JWT expired");
    const outro = await traduzirErroDePermissao(REST, resp(409, { code: "23505", message: "duplicate key" }));
    expect((await outro.json()).message).toBe("duplicate key");
    const ok = await traduzirErroDePermissao(REST, resp(200, [{ id: 1 }]));
    expect(await ok.json()).toEqual([{ id: 1 }]);
    const auth = await traduzirErroDePermissao("https://api.exemplo/auth/v1/token", resp(403, { code: "42501", message: "x" }));
    expect((await auth.json()).message).toBe("x");
  });
  it("corpo que não é JSON passa intacto", async () => {
    const r = await traduzirErroDePermissao(REST, new Response("<html>", { status: 403 }));
    expect(await r.text()).toBe("<html>");
  });
  it("o fetch embrulhado devolve a resposta traduzida", async () => {
    const f = fetchComErroDePermissao((async () => resp(403, { code: "42501", message: "rls" })) as typeof fetch);
    const r = await f(REST);
    expect((await r.json()).message).toBe(MENSAGEM_SEM_PERMISSAO);
  });
});
