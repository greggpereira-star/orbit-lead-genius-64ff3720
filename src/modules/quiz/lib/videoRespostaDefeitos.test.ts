import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { caminhoDoVideo, extensaoDoVideo } from "./videoResposta";

const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
const gravador = readFileSync("src/modules/quiz/components/VideoAnswerRecorder.tsx", "utf8");
const rota = readFileSync("src/routes/api/public/quiz-video-answer.ts", "utf8");

describe("o que o iPhone grava (mp4) não é guardado como webm", () => {
  it("extensão segue o contêiner real", () => {
    expect(extensaoDoVideo("video/mp4")).toBe("mp4");
    expect(extensaoDoVideo("video/mp4;codecs=avc1")).toBe("mp4");
    expect(extensaoDoVideo("video/webm;codecs=vp8,opus")).toBe("webm");
    expect(extensaoDoVideo("")).toBe("webm");
  });

  it("o caminho leva a extensão certa e o padrão não muda", () => {
    expect(caminhoDoVideo("e", "q", "i", "video/mp4")).toBe("e/q/respostas/i.mp4");
    expect(caminhoDoVideo("e", "q", "i")).toBe("e/q/respostas/i.webm");
  });

  it("a rota não crava video/webm no upload", () => {
    expect(rota).not.toContain('contentType: "video/webm"');
    expect(rota).toContain("extensaoDoVideo(arquivo.type)");
    expect(rota).toContain("caminhoDoVideo(q.company_id, q.id, id, arquivo.type)");
  });
});

describe("bloco de vídeo-resposta", () => {
  it("o botão usa a regra do bloco: opcional sem vídeo pode seguir", () => {
    const i = player.indexOf("case 'video-answer':");
    const trecho = player.slice(i, i + 1500);
    expect(trecho).toContain("disabled={!canSubmit || !stepValid || saving}");
    expect(trecho).not.toContain("disabled={!value}");
  });

  it("envio que termina depois de desmontar não avança a etapa seguinte", () => {
    expect((gravador.match(/if \(montadoRef\.current\) onEnviado\(/g) ?? []).length).toBe(2);
    expect(gravador).toContain("if (!montadoRef.current) return;");
  });
});
