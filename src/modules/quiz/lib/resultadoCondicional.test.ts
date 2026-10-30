import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Dois defeitos achados andando o quiz da Mentoria no ensaio local (28/10/2026):
 *
 * 1. O bloco Resultado guarda o texto em `resultTitle`/`resultBody`, mas a etapa
 *    só desenhava `title`/`subtitle`: tela em branco com o botão.
 * 2. Com dois resultados condicionais (um escondido por perfil), a etapa
 *    alcançada nunca era a de índice final, a gravação "ao chegar" não rodava
 *    e o lead ficava capturado SEM submissão (quiz_completed=false).
 */
const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");

describe("tela de resultado do player", () => {
  it("desenha resultTitle/resultBody quando o bloco não tem title/subtitle", () => {
    const caso = player.slice(player.indexOf("case 'result': {"));
    const trecho = caso.slice(0, caso.indexOf("case 'argument':"));
    expect(trecho).toContain("block.resultTitle");
    expect(trecho).toContain("block.resultBodyRich");
  });

  it("grava ao chegar na última etapa VISÍVEL, não só na de índice final", () => {
    expect(player).toContain("ehUltimaVisivel(idx, nextResponses)");
    expect(player).not.toContain("if (idx >= steps.length - 1 && !preview)");
  });

  it("botão do resultado com link abre o link e não abre uma segunda tela de conclusão", () => {
    const caso = player.slice(player.indexOf("case 'result': {"));
    const trecho = caso.slice(0, caso.indexOf("case 'argument':"));
    expect(trecho).toContain("window.open(u, '_blank'");
    expect(trecho).toContain("urlSegura(block.ctaUrl)");
  });
});

describe("gravar ao chegar só em tela que apenas apresenta", () => {
  const fonte = player;
  it("exige etapaSoApresenta além de ehUltimaVisivel", () => {
    expect(fonte).toMatch(/ehUltimaVisivel\(idx, nextResponses\) && etapaSoApresenta\(idx, nextResponses\)/);
  });
  it("considera formulário, vídeo, agendamento e contêiner como coleta", () => {
    expect(fonte).toMatch(/'form', 'video-answer', 'scheduling', 'container'/);
  });
});

describe("player: robustez do avanço e da conclusão", () => {
  it("o avanço tem trava de reentrada", () => {
    expect(player).toContain("travaDeAvanco.current");
  });
  it("captura antecipada libera a chave quando falha, para tentar de novo", () => {
    expect(player).toMatch(/if \(!leadId && capturedContact\.current === chave\) capturedContact\.current = ''/);
  });
  it("o evento 'complete' não segura a tela de conclusão", () => {
    expect(player).not.toMatch(/await quizService\s*\.trackEvent\(\{\s*quizId,\s*companyId,\s*submissionId: id,\s*eventType: 'complete'/);
  });
  it("a barra de progresso usa só etapas visíveis", () => {
    expect(player).toContain("progressoVisivel.posicao / progressoVisivel.total");
  });
  it("a tela final escolhe o resultado visível e só mostra % e botão quando fazem sentido", () => {
    const vista = player.slice(player.indexOf("function ResultView"));
    expect(vista).toContain("isBlockVisible(b, state.responses, escopoDoResultado)");
    expect(vista).toContain("{max > 0 && (");
    expect(vista).toMatch(/resultBlock\?\.ctaLabel && urlSegura\(resultBlock\.ctaUrl\)/);
  });
  it("gravação de vídeo abandonada não é enviada", () => {
    const rec = readFileSync("src/modules/quiz/components/VideoAnswerRecorder.tsx", "utf8");
    expect(rec).toContain("if (!montadoRef.current) return;");
  });
});
