import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * A tela de respostas e o CSV precisam ler a MESMA fonte.
 *
 * A tela chamada "Respostas" passou meses mostrando contato, pontos e
 * temperatura e nenhuma resposta — `listSubmissions` trazia `answers` do banco
 * e descartava no mapeamento. Agora que as duas saídas existem, o risco vira
 * outro: uma ganhar pergunta que a outra não tem, e ninguém notar até alguém
 * comparar na mão.
 */
const tela = readFileSync("src/routes/_app.quizzes_.$id.responses.tsx", "utf8");
const servico = readFileSync("src/modules/quiz/services/quizService.ts", "utf8");

describe("respostas na tela", () => {
  it("a tela usa as mesmas funções do CSV", () => {
    for (const fn of ["perguntasDoSchema", "valorLegivel", "tituloDaColuna"]) {
      expect(tela, fn).toContain(fn);
    }
  });

  it("a tela e o CSV montam a partir do mesmo schema carregado uma vez", () => {
    // Um `getLatestSchema` só: dois carregamentos podem devolver versões
    // diferentes se alguém publicar no meio, e aí a tela e o arquivo divergem.
    expect(tela.match(/getLatestSchema/g)?.length ?? 0).toBe(1);
  });

  it("o serviço entrega as respostas, não só o contato", () => {
    expect(servico).toContain("answers: r.answers");
  });

  it("resposta em mídia é tratada com o detector compartilhado", () => {
    expect(tela).toContain("midiaDaResposta");
  });
});
