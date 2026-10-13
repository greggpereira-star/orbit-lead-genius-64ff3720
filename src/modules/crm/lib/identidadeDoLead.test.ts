import { describe, it, expect } from "vitest";
import {
  acharDuplicado,
  finalDoTelefone,
  mesmaPessoa,
  normalizarEmail,
  normalizarTelefone,
} from "./identidadeDoLead";

/**
 * Medido na base em 13/10: 560 leads, 28 linhas excedentes por e-mail
 * repetido — 5% do CRM é a mesma pessoa contada duas ou três vezes.
 *
 * Deduplicar errado é pior que não deduplicar: juntar duas pessoas diferentes
 * perde o contato de uma delas, e isso não tem desfazer. Por isso a regra é
 * conservadora em telefone incompleto e nunca casa por campo vazio.
 */
describe("normalizarEmail", () => {
  it("ignora caixa e espaço", () => {
    expect(normalizarEmail("  Maria@Email.com ")).toBe("maria@email.com");
  });

  it("vazio não é identidade", () => {
    for (const v of ["", "   ", null, undefined]) expect(normalizarEmail(v)).toBeNull();
  });
});

describe("normalizarTelefone", () => {
  it("as formas do mesmo celular dão a mesma cadeia", () => {
    const formas = [
      "11 99999-8888",
      "(11) 99999-8888",
      "+55 11 99999-8888",
      "55 11 999998888",
      "011 99999 8888",
      "5511999998888",
    ];
    const normalizados = new Set(formas.map(normalizarTelefone));
    expect(normalizados.size, `deu ${[...normalizados].join(", ")}`).toBe(1);
  });

  it("fixo de 10 dígitos também é estável", () => {
    expect(normalizarTelefone("(11) 3333-4444")).toBe(normalizarTelefone("+55 11 3333-4444"));
  });

  it("número incompleto não vira palpite", () => {
    // Casar por pedaço junta gente diferente, e juntar não tem desfazer.
    for (const v of ["99998888", "123", "", null]) expect(normalizarTelefone(v)).toBeNull();
  });
});

describe("mesmaPessoa", () => {
  it("e-mail igual basta", () => {
    expect(mesmaPessoa({ email: "A@b.com" }, { email: "a@B.com", phone: "11999998888" })).toBe(
      true,
    );
  });

  it("telefone igual basta, mesmo com e-mails diferentes", () => {
    // É o caso de quem respondeu dois quizzes dando contatos distintos.
    expect(
      mesmaPessoa(
        { email: "pessoal@x.com", phone: "(11) 99999-8888" },
        { email: "trabalho@y.com", phone: "+55 11 99999-8888" },
      ),
    ).toBe(true);
  });

  it("campo vazio não casa com campo vazio", () => {
    expect(mesmaPessoa({ email: "" }, { email: "" })).toBe(false);
    expect(mesmaPessoa({ phone: null }, { phone: undefined })).toBe(false);
    expect(mesmaPessoa({}, {})).toBe(false);
  });

  it("pessoas diferentes continuam diferentes", () => {
    expect(
      mesmaPessoa(
        { email: "ana@x.com", phone: "11999998888" },
        { email: "bia@x.com", phone: "11999997777" },
      ),
    ).toBe(false);
  });

  it("telefone incompleto não aproxima ninguém", () => {
    expect(mesmaPessoa({ phone: "99998888" }, { phone: "11999998888" })).toBe(false);
  });
});

describe("finalDoTelefone", () => {
  it("é igual entre as formas, para servir de busca no banco", () => {
    const formas = ["11 99999-8888", "+55 11 99999-8888", "999998888"];
    expect(new Set(formas.map(finalDoTelefone)).size).toBe(1);
  });

  it("não busca por menos de 8 dígitos", () => {
    expect(finalDoTelefone("1234567")).toBeNull();
  });
});

describe("acharDuplicado", () => {
  const existentes = [
    { id: "1", email: "ana@x.com", phone: null },
    { id: "2", email: null, phone: "(11) 98888-7777" },
  ];

  it("acha pelo e-mail", () => {
    expect(acharDuplicado({ email: "ANA@x.com" }, existentes)?.id).toBe("1");
  });

  it("acha pelo telefone em outra forma", () => {
    expect(acharDuplicado({ phone: "+55 11 98888-7777" }, existentes)?.id).toBe("2");
  });

  it("não acha quem não está lá", () => {
    expect(acharDuplicado({ email: "novo@x.com", phone: "11911112222" }, existentes)).toBeNull();
  });
});
