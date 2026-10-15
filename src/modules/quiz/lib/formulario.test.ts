import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { formularioPodeAvancar, placeholderDoTelefone } from "./formulario";

const ok = { name: "Ana", email: "ana@gmail.com", phone: "(11) 99999-8888" };
const todos = { name: true, email: true, phone: true };

describe("formularioPodeAvancar", () => {
  it("telefone opcional (padrão): vazio avança", () => {
    expect(formularioPodeAvancar(todos, { ...ok, phone: "" })).toBe(true);
    expect(formularioPodeAvancar(undefined, { ...ok, phone: "" })).toBe(true);
  });

  it("telefone obrigatório: vazio ou só espaços não avança", () => {
    const c = { ...todos, phoneRequired: true };
    expect(formularioPodeAvancar(c, { ...ok, phone: "" })).toBe(false);
    expect(formularioPodeAvancar(c, { ...ok, phone: "   " })).toBe(false);
    expect(formularioPodeAvancar(c, ok)).toBe(true);
  });

  it("obrigatório com o campo escondido não trava ninguém", () => {
    const c = { name: true, email: true, phone: false, phoneRequired: true };
    expect(formularioPodeAvancar(c, { ...ok, phone: "" })).toBe(true);
  });

  it("telefone preenchido porém inválido bloqueia, obrigatório ou não", () => {
    expect(formularioPodeAvancar(todos, { ...ok, phone: "2121121221212" })).toBe(false);
    expect(formularioPodeAvancar({ ...todos, phoneRequired: true }, { ...ok, phone: "123" })).toBe(
      false,
    );
  });

  it("e-mail inválido bloqueia; e-mail vazio bloqueia quando o campo existe", () => {
    expect(formularioPodeAvancar(todos, { ...ok, email: "ana@" })).toBe(false);
    expect(formularioPodeAvancar(todos, { ...ok, email: "" })).toBe(false);
  });

  it("sem campo de e-mail, e-mail vazio não bloqueia", () => {
    expect(
      formularioPodeAvancar({ name: true, email: false, phone: true }, { ...ok, email: "" }),
    ).toBe(true);
  });
});

describe("placeholderDoTelefone", () => {
  it("avisa quando é obrigatório", () => {
    expect(placeholderDoTelefone({ phoneRequired: true })).toBe("Telefone (obrigatório)");
    expect(placeholderDoTelefone({})).toBe("Telefone");
    expect(placeholderDoTelefone(undefined)).toBe("Telefone");
  });
});

describe("o autor consegue ligar a regra", () => {
  it("o inspetor grava phoneRequired", () => {
    const inspetor = readFileSync("src/modules/quiz/components/QuizInspector.tsx", "utf8");
    expect(inspetor).toContain("phoneRequired: v");
  });
});
