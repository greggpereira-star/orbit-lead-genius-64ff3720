import { describe, it, expect } from "vitest";
import { humanizeValue, answerKind } from "./leadFields";

/**
 * O resumo do perfil não pode imprimir estrutura de máquina.
 *
 * Visto na ficha de um lead do cliente em 07/10: o bloco "Resumo do perfil"
 * abria com `Contato investimento de {"b-dor":"o2","b-card":true,…}` — o mapa
 * inteiro de respostas, com id de bloco e id de opção, na tela que o corretor
 * lê antes de ligar.
 *
 * Foram DOIS defeitos encadeados, e cada um precisa da sua trava: o objeto
 * virava JSON na exibição, e o classificador lia esse JSON como se fosse texto
 * de resposta — a palavra "investimento" apareceu ali porque é parte do id de
 * um bloco, não porque o lead falou de dinheiro.
 */
describe("humanizeValue com objeto", () => {
  it("contato vira linha legível", () => {
    expect(humanizeValue({ name: "Ana", email: "a@b.c", phone: "27999" })).toBe(
      "Ana · a@b.c · 27999",
    );
  });

  it("agendamento vira data e hora", () => {
    expect(humanizeValue({ data: "10/10", hora: "14h" })).toBe("10/10 14h");
  });

  it("forma desconhecida ainda cai no JSON, como rede de segurança", () => {
    expect(humanizeValue({ foo: 1 })).toBe('{"foo":1}');
  });
});

describe("answerKind com valor serializado", () => {
  it("não classifica pelo conteúdo de um blob", () => {
    const blob = '{"b-dor":"o2","b-investimento":"v2","b-card":true}';
    expect(answerKind("respostas", blob)).toBe("other");
  });

  it("array serializado também não classifica", () => {
    expect(answerKind("respostas", '["orcamento","x"]')).toBe("other");
  });

  it("a pergunta continua mandando quando ela própria diz o assunto", () => {
    expect(answerKind("qual seu orçamento", "v2")).toBe("budget");
  });

  it("valor de texto comum continua servindo de desempate", () => {
    expect(answerKind("resposta", "Minha renda é de 5 mil")).toBe("money");
  });
});
