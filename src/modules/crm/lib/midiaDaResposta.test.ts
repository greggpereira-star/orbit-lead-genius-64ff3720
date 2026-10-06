import { describe, it, expect } from "vitest";
import { midiaDaResposta } from "./midiaDaResposta";

const assinada =
  "https://supabase-api.altleadflow.com.br/storage/v1/object/sign/quiz-media/emp/quiz/respostas/abc.webm?token=eyJhbGciOiJIUzI1NiJ9.algo.assinatura";

describe("midiaDaResposta", () => {
  it("reconhece o vídeo numa URL ASSINADA, com token na ponta", () => {
    // É a forma real: `endsWith('.webm')` daria falso em toda resposta de
    // verdade — e passaria num teste que usasse URL limpa.
    expect(midiaDaResposta(assinada)).toEqual({ tipo: "video", url: assinada });
  });

  it("reconhece áudio e imagem", () => {
    expect(midiaDaResposta("https://x/a/b.mp3")?.tipo).toBe("audio");
    expect(midiaDaResposta("https://x/a/b.PNG")?.tipo).toBe("imagem");
  });

  it("texto comum não vira mídia", () => {
    expect(midiaDaResposta("Sim")).toBeNull();
    expect(midiaDaResposta("70")).toBeNull();
    expect(midiaDaResposta("gosto de vídeo.mp4 como formato")).toBeNull();
  });

  it("url sem extensão conhecida não vira mídia", () => {
    expect(midiaDaResposta("https://exemplo.com/pagina")).toBeNull();
  });

  it("não quebra com vazio nem com url malformada", () => {
    expect(midiaDaResposta(undefined)).toBeNull();
    expect(midiaDaResposta("")).toBeNull();
    expect(midiaDaResposta("https://")).toBeNull();
  });

  it("a extensão vale só no caminho, não no parâmetro", () => {
    // `?arquivo=x.mp4` não faz da página um vídeo.
    expect(midiaDaResposta("https://exemplo.com/pagina?arquivo=x.mp4")).toBeNull();
  });
});
