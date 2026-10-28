import { describe, expect, it } from "vitest";

import { descreverUltimoContato, paraCampoLocal, validarHorario } from "./contatos";

const agora = new Date("2026-10-28T15:00:00");
const chegada = new Date("2026-10-28T08:00:00");

describe("validarHorario", () => {
  it("aceita horário entre a chegada do lead e agora", () => {
    expect(validarHorario(new Date("2026-10-28T09:30:00"), chegada, agora)).toBeNull();
  });
  it("recusa futuro, anterior à chegada e vazio", () => {
    expect(validarHorario(new Date("2026-10-28T16:00:00"), chegada, agora)).toMatch(/futuro/);
    expect(validarHorario(new Date("2026-10-28T07:00:00"), chegada, agora)).toMatch(/anterior/);
    expect(validarHorario(null, chegada, agora)).toMatch(/Informe/);
    expect(validarHorario(new Date("x"), chegada, agora)).toMatch(/Informe/);
  });
  it("tolera até 1 minuto de relógio adiantado", () => {
    expect(validarHorario(new Date("2026-10-28T15:00:30"), chegada, agora)).toBeNull();
  });
});

describe("paraCampoLocal", () => {
  it("formata no fuso local, com zero à esquerda", () => {
    expect(paraCampoLocal(new Date("2026-03-05T07:04:00"))).toBe("2026-03-05T07:04");
  });
});

describe("descreverUltimoContato", () => {
  const base = { id: "1", canal: "ligacao" as const, author_name: "Dora" };
  const t = (iso: string) => new Date(iso).toISOString();
  it("contato no horário do clique não leva nota", () => {
    const d = descreverUltimoContato(
      { ...base, contatado_em: t("2026-10-28T14:00:00"), created_at: t("2026-10-28T14:00:10") },
      agora.getTime(),
    );
    expect(d).toBe("Ligação · há 1 h · Dora");
  });
  it("horário informado depois mostra quando foi registrado", () => {
    const d = descreverUltimoContato(
      { ...base, contatado_em: t("2026-10-28T09:00:00"), created_at: t("2026-10-28T14:30:00") },
      agora.getTime(),
    );
    expect(d).toContain("há 6 h");
    expect(d).toContain("horário informado, registrado há 30 min");
  });
  it("registro feito agora não diz 'há 0 s'", () => {
    const d = descreverUltimoContato(
      { ...base, contatado_em: t("2026-10-28T09:00:00"), created_at: t("2026-10-28T14:59:50") },
      agora.getTime(),
    );
    expect(d).toContain("registrado agora há pouco");
  });
});
