import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

let resposta: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const filtros: unknown[][] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => {
      filtros.push(["from", t]);
      const q: any = {
        select: (c: string) => (filtros.push(["select", c]), q),
        eq: (...a: unknown[]) => (filtros.push(["eq", ...a]), q),
        maybeSingle: () => Promise.resolve(resposta),
      };
      return q;
    },
  },
}));

import { lerEtapaDoLead } from "../services/stageService";

beforeEach(() => {
  filtros.length = 0;
  resposta = { data: null, error: null };
});

describe("lerEtapaDoLead", () => {
  it("lê só etapa e status do lead pedido", async () => {
    resposta = {
      data: { stage_id: "s1", status: "contacted", stage_entered_at: "x", updated_at: "y" },
      error: null,
    };
    const r = await lerEtapaDoLead("l1");
    expect(r).toMatchObject({ stage_id: "s1", status: "contacted" });
    expect(filtros).toContainEqual(["from", "leads"]);
    expect(filtros).toContainEqual(["eq", "id", "l1"]);
  });
  it("erro do banco devolve null (a ficha não quebra, só não atualiza)", async () => {
    resposta = { data: null, error: { message: "x" } };
    expect(await lerEtapaDoLead("l1")).toBeNull();
  });
});

describe("ficha do lead acompanha a etapa que muda por fora", () => {
  const fonte = readFileSync("src/modules/crm/components/LeadDetailDialog.tsx", "utf8");
  it("o seletor de etapa ressincroniza quando a etapa do lead muda", () => {
    // O seletor mora em EtapaDoLead (compartilhado com o painel da conversa do WhatsApp).
    const seletor = readFileSync("src/modules/crm/components/EtapaDoLead.tsx", "utf8");
    expect(seletor).toContain("useEffect(() => {\n    setCurrentId(stageId);\n  }, [stageId]);");
    expect(fonte).toContain("stageId={(lead as { stage_id?: string | null }).stage_id ?? null}");
  });
  it("adicionar etiqueta relê a etapa e devolve o lead ao pai", () => {
    expect(fonte).toContain("aoAdicionar={() => void relerEtapaDoLead()}");
    expect(fonte).toContain("onLeadUpdated?.({ ...lead, ...data } as LeadRow)");
  });
});
