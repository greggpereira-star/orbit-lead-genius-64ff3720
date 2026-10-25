import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("a ficha acompanha o responsável depois de atribuir", () => {
  const picker = ler("src/modules/crm/components/OwnerPicker.tsx");
  const ficha = ler("src/modules/crm/components/LeadDetailDialog.tsx");

  it("o seletor avisa quem o chamou assim que a gravação dá certo, antes de recarregar a lista", () => {
    expect(picker).toContain("aoAtribuir?: (userId: string | null) => void;");
    const ini = picker.indexOf("onSuccess: (_, userId) => {");
    const corpo = picker.slice(ini, picker.indexOf("onError", ini));
    expect(corpo.indexOf("aoAtribuir?.(userId)")).toBeGreaterThan(-1);
    expect(corpo.indexOf("aoAtribuir?.(userId)")).toBeLessThan(corpo.indexOf("invalidateQueries"));
  });

  it("os dois seletores da ficha devolvem o lead com o novo responsável (inclusive 'sem responsável')", () => {
    const usos = ficha.match(/aoAtribuir=\{\(userId\) => onLeadUpdated\?\.\(\{ \.\.\.lead, assigned_to: userId \} as LeadRow\)\}/g) ?? [];
    expect(usos.length).toBe(2);
  });

  it("a lista de Leads e o Kanban guardam esse retrato atualizado", () => {
    for (const f of ["src/routes/_app.leads.tsx", "src/modules/crm/components/KanbanBoard.tsx"]) {
      const s = ler(f);
      expect(s, f).toContain("onLeadUpdated={(updated) =>");
      expect(s, f).toContain("setDetailLead((prev) => (prev && prev.id === updated.id ? updated : prev))");
    }
  });
});
