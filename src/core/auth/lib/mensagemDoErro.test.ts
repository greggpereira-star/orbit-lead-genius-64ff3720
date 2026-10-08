import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { mensagemDoErro, erroContem } from "./mensagemDoErro";

describe("mensagemDoErro", () => {
  it("Error normal devolve a mensagem", () => {
    expect(mensagemDoErro(new Error("Invalid login credentials"))).toBe(
      "Invalid login credentials",
    );
  });

  it("string lançada vira ela mesma", () => {
    expect(mensagemDoErro("deu ruim")).toBe("deu ruim");
  });

  it("erro do GoTrue com error_description", () => {
    expect(mensagemDoErro({ error_description: "Email not confirmed" })).toBe(
      "Email not confirmed",
    );
  });

  it("erro do PostgREST sem texto cai no código, que é o que dá para investigar", () => {
    expect(mensagemDoErro({ code: "42501" })).toBe("Erro 42501");
  });

  it("objeto vazio NÃO vira vazio — foi ele que virou `{}` na tela", () => {
    const m = mensagemDoErro({});
    expect(m).not.toBe("");
    expect(m).not.toBe("{}");
    expect(m).toContain("sem descrição");
  });

  it("null e undefined também dizem algo", () => {
    expect(mensagemDoErro(null)).toContain("sem descrição");
    expect(mensagemDoErro(undefined)).toContain("sem descrição");
  });

  it("referência circular não derruba a função", () => {
    const a: Record<string, unknown> = { code: null };
    a.self = a;
    expect(() => mensagemDoErro(a)).not.toThrow();
  });
});

describe("erroContem", () => {
  it("acha o trecho sem estourar em erro sem message", () => {
    expect(erroContem(new Error("Email not confirmed"), "email not confirmed")).toBe(true);
    expect(erroContem({}, "email not confirmed")).toBe(false);
  });
});

/**
 * O caminho de autenticação não pode ler `.message` direto.
 *
 * Foi assim que o erro real se perdeu: `err.message.includes(...)` dentro de um
 * `catch` lança `TypeError` quando o erro não tem `message`, e o que chega ao
 * usuário é uma caixa vermelha vazia em vez da causa.
 */
describe("nenhuma leitura crua de .message no fluxo de auth", () => {
  const arquivos = {
    AuthContext: "src/core/auth/context/AuthContext.tsx",
    "tela de login": "src/routes/_auth.login.tsx",
  };

  for (const [nome, caminho] of Object.entries(arquivos)) {
    it(`${nome}: sem \`.message.includes\` nem interpolação crua`, () => {
      const fonte = readFileSync(caminho, "utf8");
      expect(fonte).not.toMatch(/\berr(or)?\.message\.(includes|toLowerCase)/);
      expect(fonte).not.toMatch(/\$\{err(or)?\.message\}/);
    });
  }
});
