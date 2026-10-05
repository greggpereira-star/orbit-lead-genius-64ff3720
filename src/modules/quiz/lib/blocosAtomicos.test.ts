import { describe, it, expect } from "vitest";
import { BLOCK_LIBRARY } from "../blocks-library";
import { validarPublicacao } from "./validarPublicacao";
import type { QuizBlock, QuizSchema } from "../types";

/**
 * Os blocos atômicos existem porque todos os outros são compostos: o `intro`
 * traz imagem, título, subtítulo E botão numa peça só. Sem eles não havia como
 * pôr uma pergunta ENTRE o título e o botão.
 */
describe("blocos atômicos", () => {
  it.each(["heading", "paragraph", "button"])("%s está na paleta, na categoria Básico", (tipo) => {
    const def = BLOCK_LIBRARY.find((b) => b.type === tipo);
    expect(def, `bloco ${tipo} ausente da paleta`).toBeTruthy();
    expect(def!.category).toBe("basico");
  });

  it("cada um nasce com UMA coisa só — nada embutido", () => {
    const t = BLOCK_LIBRARY.find((b) => b.type === "heading")!.create() as QuizBlock;
    expect(t.title).toBeTruthy();
    expect(t.ctaLabel).toBeUndefined();
    expect(t.subtitle).toBeUndefined();

    const p = BLOCK_LIBRARY.find((b) => b.type === "paragraph")!.create() as QuizBlock;
    expect(p.subtitle).toBeTruthy();
    expect(p.title).toBeUndefined();
    expect(p.ctaLabel).toBeUndefined();

    const b = BLOCK_LIBRARY.find((b) => b.type === "button")!.create() as QuizBlock;
    expect(b.ctaLabel).toBeTruthy();
    expect(b.title).toBeUndefined();
  });

  it("a categoria Básico vem antes das outras na paleta", () => {
    const primeiro = BLOCK_LIBRARY[0];
    expect(primeiro.category).toBe("basico");
  });
});

/** Monta um quiz de uma etapa com os blocos dados, mais captura e resultado. */
function quizCom(blocosDaEtapa: QuizBlock[]): QuizSchema {
  const captura: QuizBlock = { id: "cap", type: "email", title: "Seu e-mail" } as QuizBlock;
  const res: QuizBlock = { id: "res", type: "result", resultTitle: "Fim" } as QuizBlock;
  return {
    design: {} as QuizSchema["design"],
    blocks: [...blocosDaEtapa, captura, res],
    steps: [
      { id: "s1", blockIds: blocosDaEtapa.map((b) => b.id) },
      { id: "s2", blockIds: ["cap"] },
      { id: "s3", blockIds: ["res"] },
    ],
  };
}

describe("o Botão é o dono do avanço", () => {
  const titulo = { id: "t", type: "heading", title: "Oi" } as QuizBlock;
  const botao = { id: "b", type: "button", ctaLabel: "Continuar" } as QuizBlock;
  const pergunta = {
    id: "q",
    type: "single-choice",
    title: "Qual?",
    options: [{ id: "o1", label: "A" }],
  } as QuizBlock;

  it("não reclama de um botão no meio da etapa — ele passou a funcionar ali", () => {
    const achados = validarPublicacao(quizCom([titulo, botao, pergunta]));
    expect(achados.filter((a) => /Botão/.test(a.mensagem))).toEqual([]);
  });

  it("não reclama de um botão único no fim", () => {
    const achados = validarPublicacao(quizCom([titulo, pergunta, botao]));
    expect(achados.filter((a) => /Botão/.test(a.mensagem))).toEqual([]);
  });

  it("avisa quando há dois botões e o primeiro não leva a lugar nenhum", () => {
    const mudo = { id: "b2", type: "button", ctaLabel: "Outro" } as QuizBlock;
    const achados = validarPublicacao(quizCom([mudo, pergunta, botao]));
    const aviso = achados.find((a) => /Botão/.test(a.mensagem));
    expect(aviso).toBeTruthy();
    expect(aviso!.nivel).toBe("avisa");
  });

  it("não avisa quando o botão extra tem link próprio", () => {
    const comLink = {
      id: "b2",
      type: "button",
      ctaLabel: "Comprar",
      ctaUrl: "https://exemplo.com",
    } as QuizBlock;
    const achados = validarPublicacao(quizCom([comLink, pergunta, botao]));
    expect(achados.filter((a) => /Botão/.test(a.mensagem))).toEqual([]);
  });

  it("nunca bloqueia a publicação por causa de botão", () => {
    const achados = validarPublicacao(quizCom([botao, pergunta]));
    expect(achados.filter((a) => a.nivel === "bloqueia" && /Botão/.test(a.mensagem))).toEqual([]);
  });
});
