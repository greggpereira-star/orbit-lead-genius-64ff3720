import { describe, expect, it } from "vitest";
import { destinoDoAviso, naoLidos, rotuloDaContagem, tempoDecorrido, type Aviso } from "./avisos";

const aviso = (over: Partial<Aviso> = {}): Aviso => ({
  id: "a",
  title: "t",
  body: null,
  conversation_id: null,
  lead_id: null,
  created_at: "2026-10-24T12:00:00Z",
  read_at: null,
  ...over,
});

describe("avisos da equipe", () => {
  it("conta só os não lidos", () => {
    expect(naoLidos([aviso(), aviso({ read_at: "2026-10-24T12:01:00Z" }), aviso()])).toBe(2);
    expect(naoLidos([])).toBe(0);
  });

  it("o sino mostra nada, o número e 9+", () => {
    expect(rotuloDaContagem(0)).toBeNull();
    expect(rotuloDaContagem(3)).toBe("3");
    expect(rotuloDaContagem(9)).toBe("9");
    expect(rotuloDaContagem(10)).toBe("9+");
    expect(rotuloDaContagem(250)).toBe("9+");
  });

  it("o clique vai para a conversa; sem ela, para o lead; sem os dois, a lugar nenhum", () => {
    expect(destinoDoAviso({ conversation_id: "c", lead_id: "l" })).toEqual({
      tipo: "conversa",
      id: "c",
    });
    expect(destinoDoAviso({ conversation_id: null, lead_id: "l" })).toEqual({
      tipo: "lead",
      id: "l",
    });
    expect(destinoDoAviso({ conversation_id: null, lead_id: null })).toEqual({ tipo: "nenhum" });
  });

  it("tempo decorrido curto", () => {
    const agora = new Date("2026-10-24T12:00:00Z");
    expect(tempoDecorrido("2026-10-24T11:59:40Z", agora)).toBe("agora");
    expect(tempoDecorrido("2026-10-24T11:55:00Z", agora)).toBe("5 min");
    expect(tempoDecorrido("2026-10-24T09:00:00Z", agora)).toBe("3 h");
    expect(tempoDecorrido("2026-10-22T12:00:00Z", agora)).toBe("2 d");
    // relógio do aparelho atrasado em relação ao servidor: nunca negativo
    expect(tempoDecorrido("2026-10-24T12:05:00Z", agora)).toBe("agora");
  });
});
