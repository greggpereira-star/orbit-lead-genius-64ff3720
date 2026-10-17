import { describe, expect, it } from "vitest";
import { montarAvisos, type EventoGuardado } from "./avisos";

const empresa = { wabas: ["WABA1"], numeros: ["PNID1"] };
const ev = (o: Partial<EventoGuardado> & { payload: Record<string, unknown> }): EventoGuardado => ({
  id: Math.random().toString(36).slice(2), field: "conta", received_at: "2026-10-16T12:00:00Z", phone_number_id: null, ...o,
});

describe("avisos da Meta", () => {
  it("evento de conta que o sistema não trata vira aviso, com gravidade pela pista do nome", () => {
    const [a] = montarAvisos([ev({ payload: { evento: "ACCOUNT_VIOLATION", wabaId: "WABA1", motivo: "spam" } })], empresa);
    expect(a).toMatchObject({ gravidade: "alta", titulo: "Evento da conta: ACCOUNT_VIOLATION", detalhe: "spam" });
  });
  it("os eventos que o processador já trata não são aviso", () => {
    const todos = ["PARTNER_REMOVED", "ACCOUNT_OFFBOARDED", "ACCOUNT_RECONNECTED"].map((evento) => ev({ payload: { evento, wabaId: "WABA1" } }));
    expect(montarAvisos(todos, empresa)).toEqual([]);
  });
  it("evento de OUTRA conta nunca aparece (isolamento por empresa)", () => {
    expect(montarAvisos([ev({ payload: { evento: "ACCOUNT_VIOLATION", wabaId: "OUTRA" } })], empresa)).toEqual([]);
  });
  it("campo desconhecido entra se for do número ou da WABA da empresa, e fica fora se não for", () => {
    const meu = ev({ field: "ignorado", phone_number_id: "PNID1", payload: { field: "phone_number_quality_update", payload: { event: "DOWNGRADE", current_limit: "TIER_1K" }, dedupKey: "x" } });
    const alheio = ev({ field: "ignorado", phone_number_id: "OUTRO", payload: { field: "phone_number_quality_update", payload: {}, dedupKey: "y" } });
    const porWaba = ev({ field: "ignorado", payload: { field: "account_review_update", payload: {}, dedupKey: "ign:account_review_update:2:WABA1:99" } });
    const r = montarAvisos([meu, alheio, porWaba], empresa);
    expect(r.map((x) => x.titulo).sort()).toEqual(["Notificação da Meta: account_review_update", "Notificação da Meta: phone_number_quality_update"]);
    expect(r.find((x) => x.titulo.includes("quality"))?.detalhe).toBe("event: DOWNGRADE · current_limit: TIER_1K");
  });
  it("mais recentes primeiro, no máximo 30, e o detalhe nunca despeja o payload inteiro", () => {
    const muitos = Array.from({ length: 40 }, (_, i) => ev({ id: `e${i}`, received_at: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z`, payload: { evento: "X_UPDATE", wabaId: "WABA1" } }));
    const r = montarAvisos(muitos, empresa);
    expect(r).toHaveLength(30);
    expect(r[0].quando >= r[29].quando).toBe(true);
    const grande = montarAvisos([ev({ field: "ignorado", phone_number_id: "PNID1", payload: { field: "f", payload: { a: "x".repeat(500) }, dedupKey: "" } })], empresa);
    expect(grande[0].detalhe!.length).toBeLessThanOrEqual(160);
  });
});
