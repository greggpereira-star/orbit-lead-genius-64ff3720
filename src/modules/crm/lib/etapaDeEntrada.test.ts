import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * O funil precisa de uma etapa de entrada para o lead novo cair. Duas rotas
 * podiam deixá-lo sem: (1) `setEntryStage` limpa a antiga e só então marca a
 * nova — se a segunda escrita falhasse, ficava zero; (2) `deleteStage` apagava
 * a de entrada sem repassar o papel.
 */
const fonte = readFileSync("src/modules/crm/services/stageService.ts", "utf8");

describe("etapa de entrada nunca fica vaga", () => {
  const set = fonte.slice(
    fonte.indexOf("export async function setEntryStage"),
    fonte.indexOf("export async function reorderStages"),
  );
  const del = fonte.slice(fonte.indexOf("export async function deleteStage"));

  it("setEntryStage restaura a anterior se a nova falhar", () => {
    expect(set).toContain("if (idAnterior) {");
    expect(set).toContain("update({ is_entry: true }).eq('id', idAnterior)");
    expect(set.indexOf("if (idAnterior)")).toBeGreaterThan(set.indexOf("if (set.error)"));
  });

  it("deleteStage repassa o papel de entrada antes de excluir", () => {
    // o trecho exato: `if (false && eraEntrada)` não pode passar
    expect(del).toContain("if (eraEntrada) {");
    expect(del).toContain("is_entry: true }).eq('id', moveLeadsToStageId)");
    expect(del.indexOf("herda")).toBeGreaterThan(-1);
    expect(del.indexOf("herda")).toBeLessThan(del.indexOf(".from('stages').delete()"));
  });
});
