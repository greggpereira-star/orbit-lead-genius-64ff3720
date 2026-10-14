import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { escolherNome } from "./nomeDoLead";
import type { QuizBlock } from "../types";

/**
 * Relato com captura em 14/10: o lead criado no quiz aparecia chamado
 * "@geadasd" — o Instagram, não o nome.
 *
 * A regra era "o primeiro Texto curto do quiz", e já tinha errado antes: o
 * lead nascia "(27) 98877-5544" porque um campo de telefone também era Texto
 * curto. Os dois erros têm a mesma raiz — não existe máscara de nome nem de
 * Instagram, a única possível para texto é `livre`, e a regra adivinhava.
 *
 * O dano vai além do CRM: o nome entra em `{{nome}}` na mensagem de WhatsApp
 * da faixa. "Olá, @geadasd!" é a primeira coisa que a pessoa leria.
 */
const t = (id: string, title: string, extra: Partial<QuizBlock> = {}): QuizBlock =>
  ({ id, type: "short-text", title, ...extra }) as unknown as QuizBlock;

describe("o cenário que gerou o relato", () => {
  it("Instagram no quiz e nome no Formulário: vale o do Formulário", () => {
    const blocos = [t("ig", "Seu Instagram (opcional)")];
    const respostas = { ig: "@geadasd" };
    expect(escolherNome(respostas, blocos, { name: "Gregg Pereira" })).toBe("Gregg Pereira");
  });

  it("Instagram e SEM nome no Formulário: fica sem nome, não com o @", () => {
    // Lead sem nome ainda tem e-mail e telefone, e quem corrige o vê. Nome
    // errado parece certo.
    const blocos = [t("ig", "Seu Instagram (opcional)")];
    expect(escolherNome({ ig: "@geadasd" }, blocos, { name: "" })).toBeUndefined();
    expect(escolherNome({ ig: "@geadasd" }, blocos, undefined)).toBeUndefined();
  });
});

describe("campo que realmente pede o nome continua valendo", () => {
  it("pergunta com a palavra nome", () => {
    expect(escolherNome({ n: "Maria Silva" }, [t("n", "Qual seu nome?")])).toBe("Maria Silva");
  });

  it("'como podemos te chamar'", () => {
    expect(escolherNome({ n: "Ana" }, [t("n", "Como podemos te chamar?")])).toBe("Ana");
  });

  it("o placeholder também conta quando o título é outro", () => {
    const b = t("n", "Para começar", { placeholder: "Digite seu nome completo" });
    expect(escolherNome({ n: "Joana" }, [b])).toBe("Joana");
  });

  it("variável de saída `nome` é declaração do autor, mesmo com título vago", () => {
    const b = t("n", "Para começar", { outputVariable: "nome" });
    expect(escolherNome({ n: "Paula" }, [b])).toBe("Paula");
  });

  it("espaço nas pontas sai", () => {
    expect(escolherNome({ n: "  Maria  " }, [t("n", "Seu nome")])).toBe("Maria");
  });
});

describe("campo que tem a palavra mas não é a pessoa", () => {
  for (const titulo of [
    "Nome da empresa",
    "Qual o nome do seu negócio?",
    "Nome da sua clínica",
    "Seu usuário do Instagram",
    "Link do seu perfil",
    "Nome do seu pet",
  ]) {
    it(`"${titulo}" não vira o nome do lead`, () => {
      expect(escolherNome({ x: "Algo" }, [t("x", titulo)])).toBeUndefined();
    });
  }
});

describe("precedência", () => {
  it("o Formulário vence um Texto curto que também pede nome", () => {
    // Era o contrário: o Formulário era só reserva.
    const r = escolherNome({ n: "Do Texto" }, [t("n", "Qual seu nome?")], { name: "Do Form" });
    expect(r).toBe("Do Form");
  });

  it("Formulário vazio cai para o Texto curto que pede nome", () => {
    const r = escolherNome({ n: "Do Texto" }, [t("n", "Qual seu nome?")], { name: "   " });
    expect(r).toBe("Do Texto");
  });

  it("a variável `nome` vence a pergunta que só parece nome", () => {
    const blocos = [
      t("a", "Qual seu nome?"),
      t("b", "Pode ser o apelido", { outputVariable: "nome" }),
    ];
    expect(escolherNome({ a: "Joana Souza", b: "Jo" }, blocos)).toBe("Jo");
  });
});

describe("campo com máscara nunca é nome", () => {
  it("telefone, mesmo com título que cita nome", () => {
    // O caso anterior: o lead nascia "(27) 98877-5544".
    const b = t("p", "Seu nome e telefone", { fieldMask: "telefone" });
    expect(escolherNome({ p: "(27) 98877-5544" }, [b])).toBeUndefined();
  });

  it("os outros tipos de bloco são ignorados", () => {
    const outros = [{ id: "e", type: "email", title: "Qual seu nome?" }] as unknown as QuizBlock[];
    expect(escolherNome({ e: "a@b.com" }, outros)).toBeUndefined();
  });
});

describe("o player usa a regra nova", () => {
  const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");

  it("o nome vem de escolherNome", () => {
    expect(player).toContain("name: escolherNome(responses, blocks, doForm)");
  });

  it("a regra do primeiro Texto curto não voltou", () => {
    expect(player, "voltou a adivinhar pelo primeiro Texto curto").not.toContain(
      "extract(responses, semMascara, 'short-text')",
    );
  });
});
