import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emUso = () =>
  new Response(
    JSON.stringify({ status: 403, error: "Forbidden", response: { message: ['This name "x" is already in use.'] } }),
    { status: 403 },
  );
const criada = () =>
  new Response(JSON.stringify({ qrcode: { base64: "QR" } }), { status: 201 });

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("EVOLUTION_API_URL", "http://evo.test");
  vi.stubEnv("EVOLUTION_API_KEY", "k");
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("createInstance depois de apagar", () => {
  it("repete enquanto a Evolution segura o nome e conecta quando libera", async () => {
    const f = vi.fn().mockResolvedValueOnce(emUso()).mockResolvedValueOnce(emUso()).mockResolvedValueOnce(criada());
    vi.stubGlobal("fetch", f);
    const { createInstance } = await import("./evolution.server");
    const p = createInstance("x");
    await vi.advanceTimersByTimeAsync(5000);
    const r = await p;
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("outro 403 ou erro não repete e mostra a causa real", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));
    vi.stubGlobal("fetch", f);
    const { createInstance } = await import("./evolution.server");
    const r = await createInstance("x");
    expect(r.ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("depois de 6 repetições desiste, com a mensagem da causa", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => emUso()));
    const { createInstance } = await import("./evolution.server");
    const p = createInstance("x");
    await vi.advanceTimersByTimeAsync(15000);
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.error).toContain("already in use");
  });
});
