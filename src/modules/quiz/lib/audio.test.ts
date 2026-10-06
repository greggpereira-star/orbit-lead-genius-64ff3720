import { describe, it, expect } from "vitest";
import { formatarTempo, barrasDaOnda, barrasTocadas, ESTILOS_DE_AUDIO } from "./audio";

describe("formatarTempo", () => {
  it("formata minutos e segundos com dois dígitos", () => {
    expect(formatarTempo(7)).toBe("0:07");
    expect(formatarTempo(65)).toBe("1:05");
    expect(formatarTempo(750)).toBe("12:30");
  });

  it("não quebra antes do áudio carregar", () => {
    // `audio.duration` é NaN até o metadata chegar — sem isto a tela mostrava
    // "NaN:NaN" nos primeiros instantes.
    expect(formatarTempo(undefined)).toBe("0:00");
    expect(formatarTempo(NaN)).toBe("0:00");
    expect(formatarTempo(Infinity)).toBe("0:00");
    expect(formatarTempo(-5)).toBe("0:00");
  });
});

describe("barrasDaOnda", () => {
  it("é determinística: o mesmo áudio tem sempre a mesma onda", () => {
    // Com `Math.random()` a onda mudaria a cada render e pareceria defeito.
    expect(barrasDaOnda("https://x/a.mp3")).toEqual(barrasDaOnda("https://x/a.mp3"));
  });

  it("áudios diferentes têm ondas diferentes", () => {
    expect(barrasDaOnda("https://x/a.mp3")).not.toEqual(barrasDaOnda("https://x/b.mp3"));
  });

  it("nenhuma barra some nem estoura", () => {
    for (const b of barrasDaOnda("seja o que for", 50)) {
      expect(b).toBeGreaterThanOrEqual(0.25);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it("devolve a quantidade pedida", () => {
    expect(barrasDaOnda("x", 12)).toHaveLength(12);
  });

  it("não quebra com url vazia", () => {
    expect(barrasDaOnda("", 5)).toHaveLength(5);
  });
});

describe("barrasTocadas", () => {
  it("nenhuma antes de tocar", () => {
    expect(barrasTocadas(28, 0)).toBe(0);
    expect(barrasTocadas(28, NaN)).toBe(0);
  });
  it("metade no meio", () => {
    expect(barrasTocadas(28, 0.5)).toBe(14);
  });
  it("nunca passa do total, mesmo com progresso acima de 1", () => {
    expect(barrasTocadas(28, 1.4)).toBe(28);
  });
});

describe("estilos oferecidos", () => {
  it("são os três que o inlead documenta", () => {
    expect(ESTILOS_DE_AUDIO.map((e) => e.valor)).toEqual(["padrao", "instagram", "escuro"]);
  });
  it("todos têm rótulo e ajuda", () => {
    for (const e of ESTILOS_DE_AUDIO) {
      expect(e.rotulo).toBeTruthy();
      expect(e.ajuda).toBeTruthy();
    }
  });
});
