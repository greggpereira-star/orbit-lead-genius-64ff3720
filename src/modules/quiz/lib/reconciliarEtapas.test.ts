import { describe, it, expect } from "vitest";
import { reconciliarEtapas } from "./reconciliarEtapas";
import type { QuizBlock, QuizSchema } from "../types";

const b = (id: string, extra: Partial<QuizBlock> = {}) => ({ id, type: "paragraph", ...extra }) as QuizBlock;

const schema = (): QuizSchema =>
  ({
    blocks: [b("c", { type: "container", childBlockIds: ["k1", "k2"] }), b("k1"), b("k2"), b("x")],
    steps: [
      { id: "s1", blockIds: ["c"] },
      { id: "s2", blockIds: ["x"] },
    ],
  }) as QuizSchema;

describe("reconciliarEtapas", () => {
  it("não apaga os filhos de Container ao reordenar etapas", () => {
    const prev = schema();
    const r = reconciliarEtapas(prev, [prev.steps![1], prev.steps![0]]);
    expect(r.blocks.map((x) => x.id).sort()).toEqual(["c", "k1", "k2", "x"]);
    expect(r.steps!.map((s) => s.blockIds)).toEqual([["x"], ["c"]]);
  });

  it("mantém os filhos logo depois do pai", () => {
    const prev = schema();
    const r = reconciliarEtapas(prev, [prev.steps![1], prev.steps![0]]);
    expect(r.blocks.map((x) => x.id)).toEqual(["x", "c", "k1", "k2"]);
  });

  it("renomear etapa (mesmos blocos) preserva tudo", () => {
    const prev = schema();
    const r = reconciliarEtapas(prev, prev.steps!.map((s) => ({ ...s, name: "Nova" })));
    expect(r.blocks).toHaveLength(4);
  });

  it("bloco fora de qualquer etapa vira etapa própria; nada some", () => {
    const prev = schema();
    prev.blocks.push(b("solto"));
    const r = reconciliarEtapas(prev, prev.steps!);
    expect(r.blocks.map((x) => x.id)).toContain("solto");
    expect(r.steps!.at(-1)!.blockIds).toEqual(["solto"]);
  });

  it("filho cujo pai saiu das etapas continua nos blocos", () => {
    const prev = schema();
    const r = reconciliarEtapas(prev, [prev.steps![1]]);
    expect(r.blocks.map((x) => x.id).sort()).toEqual(["c", "k1", "k2", "x"]);
  });
});
