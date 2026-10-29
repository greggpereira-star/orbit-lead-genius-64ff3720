import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => {
  const cadeia: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) cadeia[m] = () => cadeia;
  cadeia.maybeSingle = async () => ({
    data: { status: "connected", config: { pixel_id: "1", access_token: "t" } },
  });
  return { supabaseAdmin: { from: () => cadeia } };
});

import { sendMetaCapiEvent } from "./meta-capi.server";

const entrada = { companyId: "C", eventName: "Lead" as const, eventId: "e1" };

afterEach(() => vi.unstubAllGlobals());

describe("envio ao Meta repete só o que vale repetir", () => {
  it("repete após erro de rede e envia na 2ª tentativa", async () => {
    const f = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await sendMetaCapiEvent(entrada);
    expect(r.status).toBe("sent");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("não repete 400 (erro do payload)", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", f);
    const r = await sendMetaCapiEvent(entrada);
    expect(r.status).toBe("failed");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("desiste após 3 tentativas", async () => {
    const f = vi.fn().mockRejectedValue(new Error("fetch failed"));
    vi.stubGlobal("fetch", f);
    const r = await sendMetaCapiEvent(entrada);
    expect(r.status).toBe("failed");
    expect(f).toHaveBeenCalledTimes(3);
  });
});
