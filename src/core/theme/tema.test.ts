import { describe, it, expect } from "vitest";
import {
  CHAVE_DO_TEMA,
  CONSULTA_ESCURO,
  SCRIPT_ANTI_PISCADA,
  lerPreferencia,
  temaEfetivo,
} from "./tema";

describe("lerPreferencia", () => {
  it("aceita as três válidas", () => {
    expect(lerPreferencia("claro")).toBe("claro");
    expect(lerPreferencia("escuro")).toBe("escuro");
    expect(lerPreferencia("sistema")).toBe("sistema");
  });

  it("qualquer outra coisa cai em sistema, sem erro", () => {
    // Vem do localStorage: pode ser de uma versão anterior, de outra aba, ou
    // de alguém editando à mão. Nada disso justifica deixar sem tema.
    for (const lixo of [null, undefined, "", "dark", "CLARO", "{}", "sistema "]) {
      expect(lerPreferencia(lixo), String(lixo)).toBe("sistema");
    }
  });
});

describe("temaEfetivo", () => {
  it("escolha explícita ignora o sistema", () => {
    expect(temaEfetivo("claro", true)).toBe("claro");
    expect(temaEfetivo("escuro", false)).toBe("escuro");
  });

  it("em sistema, quem manda é o sistema", () => {
    expect(temaEfetivo("sistema", true)).toBe("escuro");
    expect(temaEfetivo("sistema", false)).toBe("claro");
  });
});

/**
 * O script anti-piscada é uma SEGUNDA implementação da mesma regra, em uma
 * linha, para rodar antes do React. Se ele divergir do módulo, o tema se aplica
 * antes da pintura e se desfaz na hidratação — que é exatamente o clarão que
 * ele existe para evitar, agora com um passo a mais.
 */
describe("script anti-piscada", () => {
  it("usa a mesma chave e a mesma consulta do módulo", () => {
    expect(SCRIPT_ANTI_PISCADA).toContain(JSON.stringify(CHAVE_DO_TEMA));
    expect(SCRIPT_ANTI_PISCADA).toContain(JSON.stringify(CONSULTA_ESCURO));
  });

  it("decide igual ao m\u00f3dulo em todos os casos", () => {
    // EXECUTA o script de verdade, com armazenamento e sistema controlados.
    // Transcrever a condi\u00e7\u00e3o aqui testaria a minha c\u00f3pia, n\u00e3o o que vai para a
    // p\u00e1gina \u2014 e foi justamente uma diverg\u00eancia entre os dois que este teste
    // pegou: com valor corrompido guardado, o script escolhia claro e o
    // m\u00f3dulo escolhia sistema.
    const rodarScript = (guardado: string | null, sistemaEscuro: boolean): boolean => {
      document.documentElement.classList.remove("dark");
      const janela = globalThis as unknown as Record<string, unknown>;
      const localStorageOriginal = janela.localStorage;
      const matchMediaOriginal = janela.matchMedia;
      Object.defineProperty(janela, "localStorage", {
        value: { getItem: () => guardado },
        configurable: true,
      });
      janela.matchMedia = () => ({ matches: sistemaEscuro });
      try {
        new Function(SCRIPT_ANTI_PISCADA)();
      } finally {
        Object.defineProperty(janela, "localStorage", {
          value: localStorageOriginal,
          configurable: true,
        });
        janela.matchMedia = matchMediaOriginal;
      }
      return document.documentElement.classList.contains("dark");
    };

    for (const guardado of [null, "claro", "escuro", "sistema", "lixo", ""]) {
      for (const sistemaEscuro of [true, false]) {
        const peloModulo = temaEfetivo(lerPreferencia(guardado), sistemaEscuro) === "escuro";
        expect(
          rodarScript(guardado, sistemaEscuro),
          `guardado=${guardado} sistema=${sistemaEscuro}`,
        ).toBe(peloModulo);
      }
    }
  });

  it("não quebra a página se o armazenamento estiver bloqueado", () => {
    // Aba anônima e cookies desligados fazem localStorage LANÇAR, não devolver
    // null. Sem o try o script morre e leva junto tudo que vem depois no head.
    expect(SCRIPT_ANTI_PISCADA).toMatch(/^try\{/);
    expect(SCRIPT_ANTI_PISCADA).toMatch(/catch/);
  });
});
