import { describe, it, expect } from "vitest";
import { prefixoDoQuiz, schemaUsaPrefixo, outroQuizUsaAMidia } from "./midiaDoQuiz";

const EMPRESA = "emp-1";
const QUIZ = "quiz-a";
const prefixo = prefixoDoQuiz(EMPRESA, QUIZ);

const url = (quiz: string) =>
  `https://api/storage/v1/object/sign/quiz-media/${EMPRESA}/${quiz}/abc.png?token=x`;

describe("prefixoDoQuiz", () => {
  it("é empresa/quiz, com barra no fim", () => {
    // Sem a barra final, `quiz-a` casaria com `quiz-ab`.
    expect(prefixo).toBe("emp-1/quiz-a/");
  });
});

describe("schemaUsaPrefixo", () => {
  it("acha a url em qualquer campo, não só nos de mídia conhecidos", () => {
    // Enumerar campos deixaria algum de fora — e o preço do engano é apagar
    // arquivo que outro quiz usa.
    expect(schemaUsaPrefixo({ blocks: [{ mediaUrl: url(QUIZ) }] }, prefixo)).toBe(true);
    expect(schemaUsaPrefixo({ blocks: [{ marcaUrl: url(QUIZ) }] }, prefixo)).toBe(true);
    expect(schemaUsaPrefixo({ blocks: [{ itens: [{ imageUrl: url(QUIZ) }] }] }, prefixo)).toBe(
      true,
    );
    expect(
      schemaUsaPrefixo({ blocks: [{ customHtml: `<img src="${url(QUIZ)}">` }] }, prefixo),
    ).toBe(true);
  });

  it("não confunde a mídia de outro quiz", () => {
    expect(schemaUsaPrefixo({ blocks: [{ mediaUrl: url("quiz-b") }] }, prefixo)).toBe(false);
  });

  it("não casa prefixo parcial", () => {
    // `emp-1/quiz-a/` não pode casar com `emp-1/quiz-abc/`.
    expect(schemaUsaPrefixo({ blocks: [{ mediaUrl: url("quiz-abc") }] }, prefixo)).toBe(false);
  });

  it("schema vazio ou ausente não usa nada", () => {
    expect(schemaUsaPrefixo(null, prefixo)).toBe(false);
    expect(schemaUsaPrefixo({ blocks: [] }, prefixo)).toBe(false);
  });

  it("na dúvida, diz que USA — o seguro é não apagar", () => {
    const circular: Record<string, unknown> = {};
    circular.ele = circular;
    expect(schemaUsaPrefixo(circular, prefixo)).toBe(true);
  });
});

describe("outroQuizUsaAMidia", () => {
  it("basta um para impedir", () => {
    expect(
      outroQuizUsaAMidia(
        [{ blocks: [{ mediaUrl: url("quiz-b") }] }, { blocks: [{ mediaUrl: url(QUIZ) }] }],
        prefixo,
      ),
    ).toBe(true);
  });

  it("nenhum usando libera a limpeza", () => {
    expect(
      outroQuizUsaAMidia([{ blocks: [] }, { blocks: [{ mediaUrl: url("quiz-b") }] }], prefixo),
    ).toBe(false);
  });

  it("sem outros quizzes, libera", () => {
    expect(outroQuizUsaAMidia([], prefixo)).toBe(false);
  });
});
