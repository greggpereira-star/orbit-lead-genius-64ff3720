import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { LIMITE_DO_NOME, mudou, normalizarNome, problemaDoNome } from "./nomeDoPerfil";

/**
 * O "Salvar" do perfil não tinha `onClick`. Nenhum. Editava-se o nome,
 * clicava, e não acontecia nada — nem gravação, nem erro, nem aviso. Sem
 * mensagem, a leitura natural é que deu certo.
 */
describe("normalizarNome", () => {
  it("tira espaço sobrando e colapsa o do meio", () => {
    // "Maria   Silva" e "Maria Silva" são a mesma pessoa digitada com pressa;
    // guardar as duas formas faria o mesmo nome aparecer diferente por aí.
    expect(normalizarNome("  Maria   Silva  ")).toBe("Maria Silva");
  });

  it("quebra de linha não sobrevive", () => {
    expect(normalizarNome("Maria\nSilva")).toBe("Maria Silva");
  });
});

describe("problemaDoNome", () => {
  it("aceita nome comum", () => {
    expect(problemaDoNome("Ana Paula")).toBeNull();
  });

  it("vazio e só espaço não passam", () => {
    for (const v of ["", "   ", "\n", null, undefined]) expect(problemaDoNome(v)).toBe("vazio");
  });

  it("uma letra não é nome", () => {
    // Evita quem apaga tudo, digita uma letra sem querer e salva — passando a
    // aparecer como "a" para o time inteiro.
    expect(problemaDoNome("a")).toBe("curto");
  });

  it("acima do limite não passa", () => {
    expect(problemaDoNome("x".repeat(LIMITE_DO_NOME + 1))).toBe("longo");
    expect(problemaDoNome("x".repeat(LIMITE_DO_NOME))).toBeNull();
  });
});

describe("mudou", () => {
  it("só há o que gravar se for válido E diferente", () => {
    expect(mudou("Ana", "Ana")).toBe(false);
    expect(mudou("  Ana  ", "Ana")).toBe(false);
    expect(mudou("Ana Paula", "Ana")).toBe(true);
    expect(mudou("", "Ana")).toBe(false);
  });
});

describe("a tela e o serviço estão ligados", () => {
  const tela = readFileSync("src/routes/_app.settings.index.tsx", "utf8");
  const servico = readFileSync("src/core/auth/services/perfilService.ts", "utf8");

  it("o botão tem ação", () => {
    expect(tela).toContain("onClick={() => void salvar()}");
    expect(tela).toContain("salvarNomeDoPerfil");
  });

  it("grava nos DOIS lugares onde o nome vive", () => {
    /* `profiles` é a fonte que o orquestrador lê; o metadado do Auth é a
       reserva do AuthContext. Esquecer o segundo faria o nome antigo
       reaparecer no primeiro carregamento seguinte. */
    expect(servico).toContain('from("profiles")');
    expect(servico).toContain("auth.updateUser");
  });

  it("atualiza a tela depois de salvar", () => {
    // Salvar e continuar vendo o nome antigo no topo parece não ter salvado.
    expect(tela).toContain("refreshContext()");
  });

  it("o e-mail continua só de leitura", () => {
    // Trocar e-mail é mudar a identidade de acesso, com confirmação e efeito
    // no login. Oferecer o campo sem o fluxo seria o mesmo botão mudo de antes.
    const i = tela.indexOf('id="email"');
    expect(i).toBeGreaterThan(0);
    expect(tela.slice(i, i + 120)).toContain("readOnly");
  });
});
