import { describe, it, expect } from "vitest";
import { validarEnvioDeVideo, caminhoDoVideo, VIDEO_RESPOSTA } from "./videoResposta";

const ok = { bytes: 1024 * 1024, mimeType: "video/webm", segundos: 10 };

describe("validarEnvioDeVideo", () => {
  it("aceita um envio normal", () => {
    expect(validarEnvioDeVideo(ok)).toBeNull();
  });

  it("aceita o mime com parâmetros de codec", () => {
    // O MediaRecorder manda `video/webm;codecs=vp8,opus`. Comparar a string
    // inteira recusaria TODO envio real, e só em produção — no teste a gente
    // escreveria o tipo limpo e passaria.
    expect(validarEnvioDeVideo({ ...ok, mimeType: "video/webm;codecs=vp8,opus" })).toBeNull();
    expect(validarEnvioDeVideo({ ...ok, mimeType: "VIDEO/MP4; codecs=avc1" })).toBeNull();
  });

  it("recusa arquivo vazio", () => {
    expect(validarEnvioDeVideo({ ...ok, bytes: 0 })?.motivo).toMatch(/vazio/i);
  });

  it("recusa acima do teto de tamanho", () => {
    expect(validarEnvioDeVideo({ ...ok, bytes: VIDEO_RESPOSTA.bytesMax + 1 })?.motivo).toMatch(
      /MB/,
    );
  });

  it("recusa formato que não veio da gravação", () => {
    expect(validarEnvioDeVideo({ ...ok, mimeType: "application/zip" })?.motivo).toMatch(/Formato/);
    expect(validarEnvioDeVideo({ ...ok, mimeType: "" })?.motivo).toMatch(/Formato/);
  });

  it("tolera dois segundos de folga na duração", () => {
    // O `MediaRecorder` não para no milissegundo exato do limite.
    expect(validarEnvioDeVideo({ ...ok, segundos: VIDEO_RESPOSTA.segundosMax + 2 })).toBeNull();
    expect(
      validarEnvioDeVideo({ ...ok, segundos: VIDEO_RESPOSTA.segundosMax + 3 })?.motivo,
    ).toMatch(/segundos/);
  });

  it("não exige duração — o servidor nem sempre sabe", () => {
    expect(validarEnvioDeVideo({ bytes: 1000, mimeType: "video/webm" })).toBeNull();
  });
});

describe("caminhoDoVideo", () => {
  it("monta o caminho só com ids do servidor", () => {
    expect(caminhoDoVideo("emp", "quiz", "abc")).toBe("emp/quiz/respostas/abc.webm");
  });

  it("não deixa o visitante escolher onde grava", () => {
    // Nenhum trecho do caminho vem do corpo do pedido: nome de arquivo vindo do
    // cliente é o caminho clássico para escrever fora da pasta.
    const caminho = caminhoDoVideo("emp", "quiz", "abc");
    expect(caminho).not.toContain("..");
    expect(caminho.split("/")).toHaveLength(4);
  });
});
