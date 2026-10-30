import { describe, it, expect } from "vitest";
import { validarPublicacao } from "./validarPublicacao";
import type { QuizBlock, QuizSchema } from "../types";

const b = (id: string, extra: Partial<QuizBlock> = {}) => ({ id, type: "short-text", ...extra }) as QuizBlock;
const sch = (blocks: QuizBlock[]): QuizSchema =>
  ({ blocks, steps: [{ id: "s", blockIds: blocks.map((x) => x.id) }] }) as QuizSchema;

describe("validarPublicacao: condições e resultado", () => {
  it("bloqueia showIf apontando para pergunta inexistente, nomeando o bloco", () => {
    const a = validarPublicacao(
      sch([b("a", { type: "email" }), b("x", { title: "Qual seu telefone?", showIf: { enabled: true, fieldBlockId: "fantasma", op: "eq", value: "1" } as never })]),
    );
    const ach = a.find((x) => x.mensagem.includes("Condição aponta"));
    expect(ach?.nivel).toBe("bloqueia");
    expect(ach?.mensagem).toContain("Qual seu telefone?");
  });
  it("bloqueia regra de salto com campo inexistente", () => {
    const a = validarPublicacao(
      sch([b("a", { type: "email" }), b("r", { logicRules: [{ fieldBlockId: "fantasma", op: "eq", value: "1", jumpToBlockId: "a" } as never] })]),
    );
    expect(a.some((x) => x.nivel === "bloqueia" && x.mensagem.includes("regra de salto"))).toBe(true);
  });
  it("condição válida não gera achado", () => {
    const a = validarPublicacao(
      sch([b("a", { type: "email" }), b("x", { showIf: { enabled: true, fieldBlockId: "a", op: "eq", value: "1" } as never })]),
    );
    expect(a.some((x) => x.mensagem.includes("Condição aponta"))).toBe(false);
  });
  it("avisa resultado com botão e sem link", () => {
    const a = validarPublicacao(sch([b("a", { type: "email" }), b("r", { type: "result", ctaLabel: "Falar agora" })]));
    expect(a.some((x) => x.nivel === "avisa" && x.mensagem.includes("botão sem link"))).toBe(true);
    const ok = validarPublicacao(sch([b("a", { type: "email" }), b("r", { type: "result", ctaLabel: "Falar", ctaUrl: "https://wa.me/55" })]));
    expect(ok.some((x) => x.mensagem.includes("botão sem link"))).toBe(false);
  });
});
