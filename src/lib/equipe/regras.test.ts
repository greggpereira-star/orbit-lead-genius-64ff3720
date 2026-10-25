import { describe, expect, it } from "vitest";
import {
  diasParaVencer,
  ehPapelConvidavel,
  emailValido,
  normalizarEmail,
  papeisQueEuPossoConceder,
  podeAlterarPapel,
  podeConvidar,
  podeRemover,
} from "./regras";

describe("quem convida quem", () => {
  it("dono convida administrador, atendente e visualizador; nunca dono", () => {
    for (const p of ["admin", "member", "viewer"]) expect(podeConvidar("owner", p)).toBe(true);
    expect(podeConvidar("owner", "owner")).toBe(false);
  });
  it("administrador convida só atendente e visualizador", () => {
    expect(podeConvidar("admin", "member")).toBe(true);
    expect(podeConvidar("admin", "viewer")).toBe(true);
    expect(podeConvidar("admin", "admin")).toBe(false);
    expect(podeConvidar("admin", "owner")).toBe(false);
  });
  it("atendente, visualizador e papel desconhecido não convidam", () => {
    for (const q of ["member", "viewer", "", "xpto"]) expect(papeisQueEuPossoConceder(q)).toEqual([]);
  });
  it("papel inválido nunca é convidável", () => {
    for (const p of ["owner", "root", "", undefined, 3]) expect(ehPapelConvidavel(p)).toBe(false);
  });
});

describe("alterar papel e remover", () => {
  const base = { ehEuMesmo: false };
  it("ninguém mexe em si mesmo", () => {
    expect(podeAlterarPapel({ ...base, ehEuMesmo: true, quem: "owner", papelAtual: "owner", novoPapel: "admin" })).toBe(false);
    expect(podeRemover({ ehEuMesmo: true, quem: "owner", papelAtual: "admin" })).toBe(false);
  });
  it("ninguém altera ou remove um dono", () => {
    for (const q of ["owner", "admin"]) {
      expect(podeAlterarPapel({ ...base, quem: q, papelAtual: "owner", novoPapel: "member" })).toBe(false);
      expect(podeRemover({ ...base, quem: q, papelAtual: "owner" })).toBe(false);
    }
  });
  it("dono altera e remove administrador, atendente e visualizador", () => {
    for (const atual of ["admin", "member", "viewer"]) {
      expect(podeRemover({ ...base, quem: "owner", papelAtual: atual })).toBe(true);
      expect(podeAlterarPapel({ ...base, quem: "owner", papelAtual: atual, novoPapel: "member" })).toBe(true);
    }
  });
  it("administrador mexe só em atendente e visualizador, e não promove a administrador", () => {
    expect(podeRemover({ ...base, quem: "admin", papelAtual: "member" })).toBe(true);
    expect(podeRemover({ ...base, quem: "admin", papelAtual: "admin" })).toBe(false);
    expect(podeAlterarPapel({ ...base, quem: "admin", papelAtual: "member", novoPapel: "viewer" })).toBe(true);
    expect(podeAlterarPapel({ ...base, quem: "admin", papelAtual: "member", novoPapel: "admin" })).toBe(false);
    expect(podeAlterarPapel({ ...base, quem: "admin", papelAtual: "admin", novoPapel: "member" })).toBe(false);
  });
  it("não dá para promover alguém a dono", () => {
    expect(podeAlterarPapel({ ...base, quem: "owner", papelAtual: "admin", novoPapel: "owner" })).toBe(false);
  });
  it("atendente e visualizador não mexem em ninguém", () => {
    for (const q of ["member", "viewer"]) {
      expect(podeRemover({ ...base, quem: q, papelAtual: "viewer" })).toBe(false);
      expect(podeAlterarPapel({ ...base, quem: q, papelAtual: "viewer", novoPapel: "member" })).toBe(false);
    }
  });
});

describe("e-mail e prazo", () => {
  it("normaliza e valida o formato", () => {
    expect(normalizarEmail("  Ana@Teste.COM ")).toBe("ana@teste.com");
    for (const ok of ["a@b.co", "ana.silva+x@dominio.com.br"]) expect(emailValido(ok)).toBe(true);
    for (const ruim of ["", "ana", "ana@", "@dominio.com", "a b@c.com", "a@b", "a@b.c"]) expect(emailValido(ruim)).toBe(false);
    expect(emailValido("a".repeat(250) + "@b.com")).toBe(false);
  });
  it("dias para vencer arredonda para cima e nunca fica negativo", () => {
    const agora = new Date("2026-10-28T12:00:00Z");
    expect(diasParaVencer("2026-11-04T12:00:00Z", agora)).toBe(7);
    expect(diasParaVencer("2026-10-28T13:00:00Z", agora)).toBe(1);
    expect(diasParaVencer("2026-10-27T12:00:00Z", agora)).toBe(0);
  });
});
