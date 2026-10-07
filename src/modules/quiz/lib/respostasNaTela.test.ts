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

/**
 * Trilha e lista lateral precisam falar a MESMA língua.
 *
 * Medido em 07/10: para a mesma etapa, na mesma tela, a trilha dizia
 * "Pergunta" e a lista dizia "1 comp. · Quando você se olha no espelho ou
 * aparece em uma fo…". Duas descrições do mesmo objeto, a um palmo uma da
 * outra. Lendo as duas do mesmo `resumirEtapa`, elas não têm como divergir.
 */
describe("vocabulário das etapas", () => {
  const builder = readFileSync("src/routes/_app.quizzes_.$id.builder.tsx", "utf8");
  const trilha = readFileSync("src/modules/quiz/components/TrilhaDeEtapas.tsx", "utf8");

  it("a lista lateral monta pelo mesmo resumirEtapa da trilha", () => {
    expect(builder).toContain("resumirEtapa");
    expect(builder).toContain("rotuloDaNatureza");
  });

  it("as duas usam a mesma tinta de natureza", () => {
    expect(builder).toContain("resumoDaEtapa.tinta");
    expect(trilha).toContain("e.tinta");
  });

  it("a lista não ecoa mais o título do primeiro bloco", () => {
    expect(builder).not.toContain("firstBlock.title || firstBlock.resultTitle");
  });
});
