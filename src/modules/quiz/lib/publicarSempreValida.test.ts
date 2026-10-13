import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Publicar é o único ato irreversível do produto: a partir dele, visitante real
 * entra no funil. As checagens de laço de salto, salto quebrado e variável que
 * não resolve existem para rodar ANTES disso — e só valem se não houver outro
 * caminho.
 *
 * Havia. A rota `/quizzes/$id/publish` chamava `quizService.publish` direto, sem
 * passar por `validarPublicacao`. Nenhum menu, botão ou link levava até ela, o
 * que fez parecer código morto por meses; mas rota de arquivo responde à URL
 * digitada, e lá dentro o botão "Publicar" funcionava — publicando com laço que
 * prende o visitante, sem nada acusar.
 *
 * A rota foi removida em 13/10 e o que ela tinha de útil (código de
 * incorporação) foi para o diálogo de configurações. Isto trava o que a
 * remoção não trava sozinha: a próxima tela que chamar `publish`.
 */
const RAIZ = "src";

const arquivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });

/** Onde `publish` é DEFINIDO, não chamado. */
const DEFINICAO = "src/modules/quiz/services/quizService.ts";

describe("todo caminho de publicação valida antes", () => {
  const chamadores = arquivos(RAIZ).filter((caminho) => {
    if (caminho.replace(/\\/g, "/") === DEFINICAO) return false;
    return /quizService\.publish\s*\(/.test(readFileSync(caminho, "utf8"));
  });

  it("existe pelo menos um chamador — senão este teste não está olhando nada", () => {
    // Guarda contra o próprio varredor: serviço renomeado, pasta movida, e
    // a lista vazia faria o teste abaixo passar sem checar coisa alguma.
    expect(chamadores.length).toBeGreaterThanOrEqual(1);
  });

  it("cada arquivo que publica também valida", () => {
    const semValidacao = chamadores.filter(
      (caminho) => !readFileSync(caminho, "utf8").includes("validarPublicacao"),
    );
    expect(semValidacao, `publicam sem validar: ${semValidacao.join(", ")}`).toEqual([]);
  });

  it("a rota /publish não voltou", () => {
    const arvore = readFileSync("src/routeTree.gen.ts", "utf8");
    expect(arvore).not.toContain("/quizzes/$id/publish");
  });

  it("o código de incorporação continua existindo em algum lugar alcançável", () => {
    // Removida a rota, isto é o que impede o embed de sumir junto com ela.
    const dialogo = readFileSync("src/modules/quiz/components/QuizSettingsDialog.tsx", "utf8");
    expect(dialogo).toContain("<iframe src=");
  });
});
