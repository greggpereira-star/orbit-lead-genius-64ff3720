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

describe("aviso de botão fora do fim da etapa", () => {
  const titulo = { id: "t", type: "heading", title: "Oi" } as QuizBlock;
  const botao = { id: "b", type: "button", ctaLabel: "Continuar" } as QuizBlock;
  const pergunta = {
    id: "q",
    type: "single-choice",
    title: "Qual?",
    options: [{ id: "o1", label: "A" }],
  } as QuizBlock;

  it("não avisa quando o botão é o último do fluxo", () => {
    const achados = validarPublicacao(quizCom([titulo, pergunta, botao]));
    expect(achados.filter((a) => /Botão/.test(a.mensagem))).toEqual([]);
  });

  it("avisa quando o botão está no meio — ele some no publicado", () => {
    const achados = validarPublicacao(quizCom([titulo, botao, pergunta]));
    const aviso = achados.find((a) => /Botão/.test(a.mensagem));
    expect(aviso).toBeTruthy();
    expect(aviso!.nivel).toBe("avisa");
  });

  it("nunca bloqueia a publicação por causa disso", () => {
    const achados = validarPublicacao(quizCom([botao, pergunta]));
    expect(achados.filter((a) => a.nivel === "bloqueia" && /Botão/.test(a.mensagem))).toEqual([]);
  });
});
