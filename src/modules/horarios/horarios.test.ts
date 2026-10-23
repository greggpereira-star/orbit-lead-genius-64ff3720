import { describe, expect, it } from "vitest";
import {
  AGENDA_PADRAO,
  dataBr,
  dentroDoHorario,
  feriadosNacionais,
  validarAgenda,
  type ConfigDoHorario,
} from "./horarios";

/** Os mesmos casos do ensaio do SQL (`dentro_do_horario`): segunda a sexta 8–18h, sábado 8–12h. */
const cfg: ConfigDoHorario = {
  enabled: true,
  timezone: "America/Sao_Paulo",
  schedule: { ...AGENDA_PADRAO, "6": { abre: "08:00", fecha: "12:00" } },
};
const em = (s: string) => new Date(s);

describe("dentroDoHorario (espelho do SQL)", () => {
  it("sem horário ou desligado: sempre dentro", () => {
    expect(dentroDoHorario(null, [], em("2026-10-25T06:00:00Z"))).toBe(true);
    expect(dentroDoHorario({ ...cfg, enabled: false }, [], em("2026-10-25T06:00:00Z"))).toBe(true);
  });

  it("abre às 08:00 em ponto, fecha às 18:00 em ponto (intervalo [abre, fecha))", () => {
    // quarta 21/10/2026, fuso -03:00
    expect(dentroDoHorario(cfg, [], em("2026-10-21T07:59:00-03:00"))).toBe(false);
    expect(dentroDoHorario(cfg, [], em("2026-10-21T08:00:00-03:00"))).toBe(true);
    expect(dentroDoHorario(cfg, [], em("2026-10-21T17:59:00-03:00"))).toBe(true);
    expect(dentroDoHorario(cfg, [], em("2026-10-21T18:00:00-03:00"))).toBe(false);
  });

  it("usa a hora do FUSO da empresa, não a do navegador", () => {
    expect(dentroDoHorario(cfg, [], em("2026-10-21T10:00:00Z"))).toBe(false); // 07:00 local
    expect(dentroDoHorario(cfg, [], em("2026-10-21T11:00:00Z"))).toBe(true); // 08:00 local
  });

  it("sábado meio período e domingo fechado", () => {
    expect(dentroDoHorario(cfg, [], em("2026-10-24T10:00:00-03:00"))).toBe(true);
    expect(dentroDoHorario(cfg, [], em("2026-10-24T13:00:00-03:00"))).toBe(false);
    expect(dentroDoHorario(cfg, [], em("2026-10-25T10:00:00-03:00"))).toBe(false);
  });

  it("feriado fecha o dia inteiro, pelo dia LOCAL", () => {
    const f = ["2026-10-21"];
    expect(dentroDoHorario(cfg, f, em("2026-10-21T10:00:00-03:00"))).toBe(false);
    expect(dentroDoHorario(cfg, f, em("2026-10-22T10:00:00-03:00"))).toBe(true);
    // 22/10 01:00 UTC ainda é 21/10 22:00 em São Paulo: feriado.
    expect(dentroDoHorario(cfg, f, em("2026-10-22T01:00:00Z"))).toBe(false);
  });
});

describe("validarAgenda", () => {
  it("agenda padrão é válida; dia ausente (fechado) também", () => {
    expect(validarAgenda(AGENDA_PADRAO)).toEqual({});
    expect(validarAgenda({})).toEqual({});
  });
  it("recusa fechar antes ou junto de abrir e hora fora do formato", () => {
    const e = validarAgenda({
      "1": { abre: "18:00", fecha: "08:00" },
      "2": { abre: "08:00", fecha: "08:00" },
      "3": { abre: "8h", fecha: "18:00" },
      "4": { abre: "08:00", fecha: "24:00" },
    });
    expect(Object.keys(e).sort()).toEqual(["1", "2", "3", "4"]);
  });
});

describe("feriados nacionais", () => {
  const f2026 = feriadosNacionais(2026);
  const dia = (nome: string) => f2026.filter((x) => x.name.startsWith(nome)).map((x) => x.day);

  it("fixos nas datas certas", () => {
    expect(dia("Natal")).toEqual(["2026-12-25"]);
    expect(dia("Tiradentes")).toEqual(["2026-04-21"]);
    expect(dia("Independência")).toEqual(["2026-09-07"]);
    expect(dia("Consciência Negra")).toEqual(["2026-11-20"]);
  });

  it("móveis de 2026 (Páscoa em 5/4): Carnaval 16 e 17/2, Sexta Santa 3/4, Corpus Christi 4/6", () => {
    expect(dia("Carnaval")).toEqual(["2026-02-16", "2026-02-17"]);
    expect(dia("Sexta-feira Santa")).toEqual(["2026-04-03"]);
    expect(dia("Corpus Christi")).toEqual(["2026-06-04"]);
  });

  it("móveis de 2025 (Páscoa em 20/4): Sexta Santa 18/4, Carnaval 3 e 4/3", () => {
    const f = feriadosNacionais(2025);
    expect(f.filter((x) => x.name.startsWith("Sexta")).map((x) => x.day)).toEqual(["2025-04-18"]);
    expect(f.filter((x) => x.name.startsWith("Carnaval")).map((x) => x.day)).toEqual([
      "2025-03-03",
      "2025-03-04",
    ]);
  });

  it("ordenados, sem data repetida, e o ponto facultativo vem marcado", () => {
    const dias = f2026.map((x) => x.day);
    expect(dias).toEqual([...dias].sort());
    expect(new Set(dias).size).toBe(dias.length);
    expect(f2026.find((x) => x.name.startsWith("Corpus"))!.name).toMatch(/ponto facultativo/);
    expect(f2026).toHaveLength(13);
  });

  it("dataBr não passa pelo fuso", () => {
    expect(dataBr("2026-10-12")).toBe("12/10/2026");
  });
});
