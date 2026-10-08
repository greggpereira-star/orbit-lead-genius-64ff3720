import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { getSteps } from "./steps";
import type { QuizSchema } from "../types";

/**
 * Etapa sem bloco é uma tela que o usuário criou e ainda não preencheu — não é
 * lixo. O construtor a mantém de propósito; quem poda é o preview/player, que
 * nunca deve mostrar tela em branco a quem responde.
 *
 * O defeito que isto trava: o fluxograma chamava `getSteps(prev)` sem
 * `keepEmpty` em TODAS as suas ações e reescrevia `schema.steps` com o
 * resultado. Bastava abrir o fluxograma e renomear uma etapa para as vazias
 * sumirem — sem erro, sem aviso, sem desfazer.
 */
describe("poda de etapa vazia", () => {
  const schema = {
    blocks: [{ id: "b1", type: "heading" }],
    steps: [
      { id: "s1", blockIds: ["b1"] },
      { id: "s2", blockIds: [] },
      { id: "s3", blockIds: [] },
    ],
  } as unknown as QuizSchema;

  it("sem keepEmpty, as vazias somem", () => {
    expect(getSteps(schema).map((s) => s.id)).toEqual(["s1"]);
  });

  it("com keepEmpty, sobrevivem", () => {
    expect(getSteps(schema, { keepEmpty: true }).map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("telas de montagem preservam etapa vazia", () => {
  /* Teste de código-fonte porque o defeito não aparece em nenhuma asserção de
     comportamento: a chamada errada compila, roda e devolve uma lista válida —
     só que menor. É a AUSÊNCIA do argumento que custa o dado.

     Lê o arquivo inteiro, comentários inclusive. Isso já pegou um comentário
     meu que continuou descrevendo a chamada sem guarda depois de ela ter sido
     corrigida — prosa desatualizada sobre este ponto também falha aqui, e é
     bom que falhe. */
  /* As ROTAS não bastam: a primeira versão deste teste cobria só elas, e o
     `buildGraph` dentro do componente do fluxograma continuou podando — o
     construtor manteve as três etapas e o desenho mostrou uma. Quem monta o
     desenho também é tela de montagem. */
  const arquivos = {
    "fluxograma (rota)": "src/routes/_app.quizzes_.$id.flow.tsx",
    "construtor (rota)": "src/routes/_app.quizzes_.$id.builder.tsx",
    "fluxograma (componente)": "src/modules/quiz/components/QuizFlowView.tsx",
    /* O Design salva o schema inteiro: mexer numa cor gravava a lista podada.
       Terceiro caso da mesma família, achado varrendo todas as chamadas. */
    "design (rota)": "src/routes/_app.quizzes_.$id.design.tsx",
  };

  for (const [nome, caminho] of Object.entries(arquivos)) {
    it(`${nome}: nenhuma chamada de getSteps sem keepEmpty`, () => {
      const fonte = readFileSync(caminho, "utf8");
      const chamadas = fonte.match(/getSteps\([^)]*\)/g) ?? [];
      const semGuarda = chamadas.filter((c) => !c.includes("keepEmpty"));
      expect(semGuarda).toEqual([]);
    });
  }
});

/**
 * O outro lado da regra, dito em voz alta.
 *
 * Depois de achar três telas de montagem podando, a tentação é espalhar
 * `keepEmpty` por toda chamada de `getSteps`. Seria pior: o player mostraria
 * tela em branco a quem responde, e a análise contaria como "chance de
 * abandono" uma etapa que ninguém chega a ver.
 *
 * Montagem preserva. Runtime e análise podam. As duas metades precisam de
 * trava, senão a próxima correção vai na direção errada.
 */
describe("telas de runtime e análise PODAM a etapa vazia", () => {
  const arquivos = {
    player: "src/modules/quiz/components/QuizPlayer.tsx",
    "análise (rota)": "src/routes/_app.quizzes_.$id.insights.tsx",
    "performance (rota)": "src/routes/_app.quizzes_.$id.performance.tsx",
  };

  for (const [nome, caminho] of Object.entries(arquivos)) {
    it(`${nome}: nenhuma chamada de getSteps com keepEmpty`, () => {
      const fonte = readFileSync(caminho, "utf8");
      const chamadas = fonte.match(/getSteps\([^)]*\)/g) ?? [];
      expect(chamadas.filter((c) => c.includes("keepEmpty"))).toEqual([]);
    });
  }

  it("uma etapa vazia nunca chega a quem responde", () => {
    const schema = {
      blocks: [{ id: "b1", type: "heading" }],
      steps: [
        { id: "s1", blockIds: [] },
        { id: "s2", blockIds: ["b1"] },
      ],
    } as unknown as QuizSchema;
    expect(getSteps(schema).map((s) => s.id)).toEqual(["s2"]);
  });
});

/**
 * Quem grava o schema inteiro precisa da trava de edição.
 *
 * O construtor tinha; o Design e o Fluxograma, não — e os três salvam o schema
 * COMPLETO. Bastava mexer numa cor com o construtor aberto noutra aba para
 * sobrescrever tudo que estava sendo montado lá. É exatamente o conflito que a
 * trava foi criada para impedir, e ficou aberto porque só uma das três telas a
 * usava.
 */
describe("telas que salvam respeitam a trava de edição", () => {
  const telas = {
    construtor: "src/routes/_app.quizzes_.$id.builder.tsx",
    design: "src/routes/_app.quizzes_.$id.design.tsx",
    fluxograma: "src/routes/_app.quizzes_.$id.flow.tsx",
  };

  for (const [nome, caminho] of Object.entries(telas)) {
    const fonte = readFileSync(caminho, "utf8");

    it(`${nome}: usa useEditLock`, () => {
      expect(fonte).toContain("useEditLock");
    });

    it(`${nome}: barra o save sem a posse`, () => {
      expect(fonte).toMatch(/if\s*\(!trava\.souDono\)/);
    });

    it(`${nome}: mostra ao usuário quem está com a edição`, () => {
      expect(fonte).toContain("EditLockBanner");
    });
  }
});

/**
 * A prévia não pode gravar nada fora da tela.
 *
 * O player já guardava os cinco caminhos que escrevem no banco. O que escapou
 * foi a Resposta em vídeo: ela sobe por uma ROTA à parte, que aceita qualquer
 * quiz publicado, então testar o bloco numa prévia gravava um arquivo de
 * verdade no armazenamento do cliente — e ele aparecia na Biblioteca de mídia
 * como gravação de visitante.
 */
describe("prévia não grava", () => {
  const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
  const gravador = readFileSync("src/modules/quiz/components/VideoAnswerRecorder.tsx", "utf8");

  it("todo trackEvent e todo envio do player passa por uma guarda de preview", () => {
    // Conta as guardas em vez das chamadas: `preview` aparece no início de
    // cada bloco que escreve, e sem nenhuma o invariante nem existe.
    expect(player.match(/if \(!?preview\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("o gravador de vídeo recebe o sinal de prévia", () => {
    expect(player).toMatch(/<VideoAnswerRecorder[\s\S]{0,260}preview=\{preview\}/);
    expect(gravador).toContain("preview?: boolean");
  });

  it("e desvia do envio antes de montar o FormData", () => {
    const corpo = gravador.slice(gravador.indexOf("const enviar"));
    const iGuarda = corpo.indexOf("if (preview)");
    const iEnvio = corpo.indexOf("new FormData");
    expect(iGuarda).toBeGreaterThan(-1);
    expect(iGuarda).toBeLessThan(iEnvio);
  });

  it("o Container repassa quizId e sessionId ao filho", () => {
    // Sem isso, uma Resposta em vídeo dentro de um container recebia quizId
    // vazio e o envio era recusado por "dados incompletos".
    const container = player.slice(player.indexOf("function ContainerView"));
    expect(container).toContain("quizId={quizId}");
    expect(container).toContain("sessionId={sessionId}");
  });
});
