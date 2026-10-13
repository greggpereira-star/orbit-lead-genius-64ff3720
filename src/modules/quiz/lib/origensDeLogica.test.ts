import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * Quem grava resposta tem que estar classificado: ou o inspetor oferece o tipo
 * como origem, ou existe um motivo escrito para não oferecer.
 *
 * O defeito que isto trava: `video-answer` gravava a URL do vídeo em
 * `responses` e o motor comparava essa string sem nenhuma objeção — mas o
 * seletor de origem nunca mostrava o bloco. Quem pedia vídeo não conseguia
 * ramificar o funil por ele nem mandar o link na mensagem, e nada no produto
 * dizia por quê. Não havia erro: havia ausência, que é pior de achar.
 *
 * A causa de ter passado: a lista de tipos existia DUAS vezes, em
 * `ANSWERABLE_TYPES` e numa cópia literal dentro do editor de regras. Este
 * teste exige lista única e cobre o terceiro ponto que vier.
 */
const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
const inspetor = readFileSync("src/modules/quiz/components/QuizInspector.tsx", "utf8");

const entre = (fonte: string, inicio: string, fim: string): string => {
  const i = fonte.indexOf(inicio);
  if (i < 0) throw new Error(`não achei "${inicio}"`);
  const j = fonte.indexOf(fim, i + inicio.length);
  if (j < 0) throw new Error(`não achei o fim "${fim}" depois de "${inicio}"`);
  return fonte.slice(i, j);
};

/**
 * Tipos que gravam valor PRÓPRIO em `responses`.
 *
 * O `draftValue` do player termina em `return true`, que vale para todo bloco
 * não citado — um título também grava, só que um `true` que não diz nada. Por
 * isso só contam os ramos explícitos, lidos daqui até esse fallback.
 */
const gravamResposta = new Set(
  [
    ...entre(player, "const draftValue = useMemo", "return true;").matchAll(
      /block\.type === '([a-z-]+)'/g,
    ),
  ].map((m) => m[1]),
);

const oferecidos = new Set(
  [...entre(inspetor, "const ANSWERABLE_TYPES = new Set([", "]);").matchAll(/"([a-z-]+)"/g)].map(
    (m) => m[1],
  ),
);

/**
 * Exclusões deliberadas. O motivo fica AQUI, não na cabeça de quem escreveu:
 * um tipo novo que grave objeto deve cair neste mapa com a razão, ou entrar na
 * lista de oferecidos — nunca ficar em silêncio nos dois lugares.
 */
const EXCLUIDOS: Record<string, string> = {
  form: "guarda objeto {name,email,phone}; String() daria [object Object]",
  scheduling: "guarda objeto {data,hora}; String() daria [object Object]",
  reveal: "guarda sempre true depois de revelado; viraria regra constante",
};

describe("origens de lógica e de mostrar-se", () => {
  it("o player realmente grava os tipos que este teste acha que grava", () => {
    // Guarda contra o parser: se o `draftValue` for reescrito e a extração
    // devolver pouca coisa, o resto do teste passaria vazio e sem sentido.
    expect(gravamResposta.size).toBeGreaterThanOrEqual(12);
    expect(gravamResposta.has("single-choice")).toBe(true);
    expect(gravamResposta.has("video-answer")).toBe(true);
  });

  it("todo tipo que grava resposta está oferecido OU excluído com motivo", () => {
    const semClassificacao = [...gravamResposta].filter((t) => !oferecidos.has(t) && !EXCLUIDOS[t]);
    expect(semClassificacao, `sem classificação: ${semClassificacao.join(", ")}`).toEqual([]);
  });

  it("nada é oferecido como origem sem gravar resposta", () => {
    const fantasmas = [...oferecidos].filter((t) => !gravamResposta.has(t));
    expect(fantasmas, `oferecidos mas não gravam: ${fantasmas.join(", ")}`).toEqual([]);
  });

  it("vídeo-resposta é origem válida: guarda string, e string o motor compara", () => {
    expect(oferecidos.has("video-answer")).toBe(true);
  });

  it("nenhuma exclusão sobrevive depois que o tipo deixa de gravar resposta", () => {
    // Exclusão de tipo que não grava mais é entulho que engana quem lê.
    const obsoletas = Object.keys(EXCLUIDOS).filter((t) => !gravamResposta.has(t));
    expect(obsoletas, `exclusões obsoletas: ${obsoletas.join(", ")}`).toEqual([]);
  });

  it("o editor de regras não mantém lista própria", () => {
    const trecho = entre(inspetor, "const origens = allBlocks.filter", ";");
    expect(trecho).toContain("ANSWERABLE_TYPES");
    expect(trecho).not.toMatch(/"single-choice"/);
  });
});
