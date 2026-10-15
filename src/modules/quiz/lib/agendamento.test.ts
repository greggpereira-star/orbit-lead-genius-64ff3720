import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { agendamentoPodeAvancar } from "./agendamento";

describe("agendamentoPodeAvancar", () => {
  it("opcional e vazio avança — antes o botão ficava preso", () => {
    expect(agendamentoPodeAvancar(undefined, { required: false, allowTime: true })).toBe(true);
    expect(agendamentoPodeAvancar({}, { required: false })).toBe(true);
  });

  it("obrigatório e vazio não avança", () => {
    expect(agendamentoPodeAvancar(undefined, { required: true })).toBe(false);
    expect(agendamentoPodeAvancar({}, { required: true, allowTime: true })).toBe(false);
  });

  it("obrigatório com dia, sem horário pedido, avança", () => {
    expect(agendamentoPodeAvancar({ data: "2026-11-02" }, { required: true })).toBe(true);
  });

  it("horário pedido: só o dia não basta, nem opcional", () => {
    const o = { allowTime: true };
    expect(agendamentoPodeAvancar({ data: "2026-11-02" }, { ...o, required: true })).toBe(false);
    expect(agendamentoPodeAvancar({ data: "2026-11-02" }, { ...o, required: false })).toBe(false);
    expect(agendamentoPodeAvancar({ data: "2026-11-02", hora: "14:00" }, o)).toBe(true);
  });

  it("só o horário, sem dia, não passa", () => {
    expect(agendamentoPodeAvancar({ hora: "14:00" }, { required: false, allowTime: true })).toBe(
      false,
    );
  });
});

describe("o player usa a mesma regra no botão e no canSubmit", () => {
  const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
  it("canSubmit delega à função pura", () => {
    expect(player).toContain("agendamentoPodeAvancar(value as ValorAgendamento | undefined");
  });
  it("o botão do agendamento não tem regra própria", () => {
    const i = player.indexOf("case 'scheduling': {");
    const trecho = player.slice(i, i + 1100);
    expect(trecho).toContain("disabled={!canSubmit || !stepValid || saving}");
    expect(trecho).not.toContain("completo");
  });
});
