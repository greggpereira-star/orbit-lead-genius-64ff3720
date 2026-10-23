import { describe, expect, it } from "vitest";
import {
  etapasDaLista,
  etiquetasDaLista,
  filtrarConversas,
  type ConversaDaLista,
} from "./conversas";

function conversa(
  id: string,
  lead: {
    stage_id?: string;
    stage?: string;
    tags?: string[];
  } | null,
): ConversaDaLista {
  return {
    id,
    status: "open",
    assigned_to: null,
    department_id: null,
    last_message_at: "2026-10-23T10:00:00Z",
    last_message_preview: "oi",
    last_inbound_at: null,
    unread_agent: 0,
    lead_id: lead ? `lead-${id}` : null,
    origin: null,
    contact: { wa_id: "5511999990000", profile_name: null, opted_out_at: null },
    lead: lead
      ? {
          id: `lead-${id}`,
          name: `Lead ${id}`,
          email: null,
          stage_id: lead.stage_id ?? null,
          stage: lead.stage ? { name: lead.stage, color: "#3b82f6" } : null,
          tags: (lead.tags ?? []).map((tag_name) => ({ tag_name })),
        }
      : null,
  };
}

const lista = [
  conversa("a", { stage_id: "s1", stage: "Qualificado", tags: ["Orçamento", "vip"] }),
  conversa("b", { stage_id: "s2", stage: "Proposta", tags: ["orçamento"] }),
  conversa("c", { stage_id: "s1", stage: "Qualificado", tags: [] }),
  conversa("d", null),
];

const ids = (l: ConversaDaLista[]) => l.map((c) => c.id).sort();
const base = { filtro: "entrada" as const, userId: "u" };

describe("filtrar a lista por etiqueta e etapa", () => {
  it("sem filtro devolve tudo, inclusive conversa sem lead", () => {
    expect(ids(filtrarConversas(lista, base))).toEqual(["a", "b", "c", "d"]);
  });

  it("etiqueta: não diferencia maiúsculas nem espaço nas pontas", () => {
    expect(ids(filtrarConversas(lista, { ...base, etiqueta: " ORÇAMENTO " }))).toEqual(["a", "b"]);
  });

  it("etapa: só quem está nela", () => {
    expect(ids(filtrarConversas(lista, { ...base, etapaId: "s1" }))).toEqual(["a", "c"]);
  });

  it("os dois filtros se combinam (e)", () => {
    expect(ids(filtrarConversas(lista, { ...base, etapaId: "s1", etiqueta: "vip" }))).toEqual([
      "a",
    ]);
  });

  it("conversa sem lead some quando há filtro de etapa ou etiqueta", () => {
    expect(ids(filtrarConversas(lista, { ...base, etapaId: "s9" }))).toEqual([]);
    expect(ids(filtrarConversas(lista, { ...base, etiqueta: "qualquer" }))).toEqual([]);
  });

  it("combina com a fila: resolvidas ficam de fora de 'entrada'", () => {
    const l = [
      { ...conversa("r", { stage_id: "s1", stage: "Qualificado" }), status: "resolved" as const },
    ];
    expect(filtrarConversas(l, { ...base, etapaId: "s1" })).toEqual([]);
  });
});

describe("opções dos filtros", () => {
  it("etiquetas: únicas, sem repetir por maiúscula, em ordem", () => {
    expect(etiquetasDaLista(lista)).toEqual(["Orçamento", "vip"]);
  });

  it("etapas: só as que existem nas conversas, sem repetir", () => {
    expect(etapasDaLista(lista).map((e) => e.nome)).toEqual(["Proposta", "Qualificado"]);
  });

  it("lista vazia não gera opção", () => {
    expect(etiquetasDaLista([])).toEqual([]);
    expect(etapasDaLista([])).toEqual([]);
  });
});

describe("filtro que perde a opção", () => {
  it("a tela desfaz o filtro quando a etiqueta ou a etapa some das conversas", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("src/modules/atendimento/components/Atendimento.tsx", "utf8");
    expect(fonte).toContain("setFiltroEtiqueta(null)");
    expect(fonte).toContain("setFiltroEtapa(null)");
  });
});
