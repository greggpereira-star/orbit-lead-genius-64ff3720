import { describe, expect, it } from "vitest";

import { MOTIVO_FORMULARIO_INATIVO, processMetaLeadEvent } from "./meta-lead-processor.server";

type Linha = Record<string, unknown> | null;

/** Cliente falso: cada tabela devolve a linha combinada e registra o que foi gravado. */
function adminFalso(tabelas: Record<string, Linha>) {
  const gravados: Array<{ tabela: string; valores: Record<string, unknown> }> = [];
  const from = (tabela: string) => {
    const cadeia: Record<string, unknown> = {};
    const devolve = () => cadeia;
    for (const m of ["select", "eq", "order", "limit"]) cadeia[m] = devolve;
    cadeia.maybeSingle = async () => ({ data: tabelas[tabela] ?? null, error: null });
    cadeia.insert = async (valores: Record<string, unknown>) => {
      gravados.push({ tabela, valores });
      return { error: null };
    };
    cadeia.update = () => cadeia;
    return cadeia;
  };
  return { admin: { from }, gravados };
}

const entrada = {
  leadgenId: "L1",
  pageId: "P1",
  formId: "F1",
  rawPayload: {},
};

const pagina = { company_id: "C1", page_access_token: "tok" };

describe("formulário desativado no processador de leads da Meta", () => {
  it("não cria lead e registra o evento como skipped com o motivo", async () => {
    const { admin, gravados } = adminFalso({
      meta_lead_pages: pagina,
      meta_lead_forms: { company_id: "C1", form_name: "Antigo", field_mapping: null, is_active: false },
    });

    const r = await processMetaLeadEvent(admin, entrada);

    expect(r).toEqual({ status: "skipped", error: MOTIVO_FORMULARIO_INATIVO });
    const evento = gravados.find((g) => g.tabela === "meta_lead_events");
    expect(evento?.valores).toMatchObject({
      leadgen_id: "L1",
      status: "skipped",
      error_message: MOTIVO_FORMULARIO_INATIVO,
      company_id: "C1",
    });
    expect(gravados.some((g) => g.tabela === "leads")).toBe(false);
  });

  it("com permitirFormularioInativo (importação manual) segue para a busca do lead", async () => {
    const { admin } = adminFalso({
      meta_lead_pages: pagina,
      meta_lead_forms: { company_id: "C1", form_name: "Antigo", field_mapping: null, is_active: false },
    });
    // hydratedLead sem field_data: passa do desvio do formulário; o que vier depois não é objeto deste teste.
    const r = await processMetaLeadEvent(admin, {
      ...entrada,
      permitirFormularioInativo: true,
      hydratedLead: { id: "L1", field_data: [] } as never,
    });

    expect(r.error).not.toBe(MOTIVO_FORMULARIO_INATIVO);
  });

  it("formulário ativo não é desviado", async () => {
    const { admin } = adminFalso({
      meta_lead_pages: pagina,
      meta_lead_forms: { company_id: "C1", form_name: "Ativo", field_mapping: null, is_active: true },
    });
    const r = await processMetaLeadEvent(admin, {
      ...entrada,
      hydratedLead: { id: "L1", field_data: [] } as never,
    });

    expect(r.error).not.toBe(MOTIVO_FORMULARIO_INATIVO);
  });
});
