import { describe, it, expect } from "vitest";
import { removerBlocosDoSchema } from "./removerBlocos";
import { isBlockVisible } from "./../engine";
import type { QuizBlock, QuizSchema } from "../types";

const b = (id: string, extra: Partial<QuizBlock> = {}) => ({ id, type: "single-choice", ...extra }) as QuizBlock;

const base = (): QuizSchema =>
  ({
    blocks: [
      b("p1", { options: [{ id: "o1", label: "a", jumpToBlockId: "t1" } as never] }),
      b("p2", { showIf: { enabled: true, fieldBlockId: "p1", op: "eq", value: "o1" } as never }),
      b("t1"),
      b("t2"),
      b("r", { logicRules: [{ id: "x", fieldBlockId: "p1", jumpToBlockId: "t2" } as never] }),
    ],
    steps: [
      { id: "s1", blockIds: ["p1", "p2"] },
      { id: "s2", blockIds: ["t1", "t2"] },
      { id: "s3", blockIds: ["r"] },
    ],
  }) as QuizSchema;

describe("removerBlocosDoSchema", () => {
  it("apagar o primeiro bloco da etapa-alvo redireciona o salto para o novo primeiro", () => {
    const r = removerBlocosDoSchema(base(), new Set(["t1"]));
    expect(r.blocks.find((x) => x.id === "p1")!.options![0].jumpToBlockId).toBe("t2");
  });
  it("apagar a etapa inteira remove o salto", () => {
    const r = removerBlocosDoSchema(base(), new Set(["t1", "t2"]), { removerEtapaId: "s2" });
    expect(r.blocks.find((x) => x.id === "p1")!.options![0].jumpToBlockId).toBeUndefined();
    expect(r.blocks.find((x) => x.id === "r")!.logicRules).toEqual([]);
    expect(r.steps!.map((s) => s.id)).toEqual(["s1", "s3"]);
  });
  it("showIf apontando para pergunta apagada é removido: o bloco volta a aparecer", () => {
    const r = removerBlocosDoSchema(base(), new Set(["p1"]));
    const p2 = r.blocks.find((x) => x.id === "p2")!;
    expect(p2.showIf).toBeUndefined();
    expect(isBlockVisible(p2, {}, {})).toBe(true);
  });
  it("regra cujo campo foi apagado some", () => {
    const r = removerBlocosDoSchema(base(), new Set(["p1"]));
    expect(r.blocks.find((x) => x.id === "r")!.logicRules).toEqual([]);
  });
  it("tira o id de childBlockIds e das etapas, sem mexer no resto", () => {
    const s = base();
    s.blocks[3] = b("t2");
    s.blocks.push(b("c", { type: "container", childBlockIds: ["t2"] } as never));
    const r = removerBlocosDoSchema(s, new Set(["t2"]));
    expect(r.blocks.find((x) => x.id === "c")!.childBlockIds).toEqual([]);
    expect(r.steps!.find((x) => x.id === "s2")!.blockIds).toEqual(["t1"]);
    expect(r.blocks.map((x) => x.id)).toContain("p1");
  });
});
