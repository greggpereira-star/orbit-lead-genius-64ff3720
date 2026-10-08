import { describe, it, expect } from "vitest";
import { validarPublicacao } from "./validarPublicacao";
import type { QuizBlock, QuizSchema, ScoreTier } from "../types";

const schema = (blocks: QuizBlock[], steps?: QuizSchema["steps"]): QuizSchema =>
  ({
    blocks,
    steps: steps ?? blocks.map((b) => ({ id: `s-${b.id}`, blockIds: [b.id] })),
  }) as QuizSchema;
const b = (id: string, type: string, extra: Record<string, unknown> = {}) =>
  ({ id, type, ...extra }) as unknown as QuizBlock;
const TIER: ScoreTier[] = [
  { id: "t", label: "A", minPercent: 50, whatsappTemplate: "Oi" },
] as ScoreTier[];

const bloqueia = (s: QuizSchema, t?: ScoreTier[]) =>
  validarPublicacao(s, t).some((a) => a.nivel === "bloqueia");

describe("validação antes de publicar", () => {
  it("quiz vazio não vai ao ar", () => {
    expect(bloqueia(schema([]))).toBe(true);
  });

  it("SEM bloco de captura não vai ao ar", () => {
    // É o caso que custou dias: o quiz roda, pontua, grava submissão — e nunca
    // gera lead, sem erro em lugar nenhum.
    const achados = validarPublicacao(schema([b("q", "single-choice"), b("r", "result")]), TIER);
    expect(achados.some((a) => a.nivel === "bloqueia" && /captura/i.test(a.mensagem))).toBe(true);
  });

  it("`Texto curto` com máscara de telefone CONTA como captura", () => {
    // Player e validador precisam concordar: senão a validação barra um quiz
    // que funciona, ou libera um que não.
    expect(
      bloqueia(schema([b("t", "short-text", { fieldMask: "telefone" }), b("r", "result")]), TIER),
    ).toBe(false);
  });

  it("`Texto curto` sem máscara NÃO conta", () => {
    expect(bloqueia(schema([b("t", "short-text"), b("r", "result")]), TIER)).toBe(true);
  });

  it("etapa vazia AVISA e explica que é ignorada", () => {
    // Não barra: o player poda as vazias, então o visitante nunca vê tela em
    // branco. O problema é do autor, que criou uma tela e não preencheu.
    const s = schema(
      [b("e", "email"), b("r", "result")],
      [
        { id: "s1", blockIds: ["e"] },
        { id: "s2", blockIds: [] },
        { id: "s3", blockIds: ["r"] },
      ],
    );
    const achados = validarPublicacao(s, TIER);
    expect(bloqueia(s, TIER)).toBe(false);
    expect(achados.some((a) => a.nivel === "avisa" && /ignorada/.test(a.mensagem))).toBe(true);
  });

  it("salto apontando para componente inexistente não vai ao ar", () => {
    const s = schema([
      b("q", "single-choice", { options: [{ id: "o", label: "x", jumpToBlockId: "SUMIU" }] }),
      b("e", "email"),
      b("r", "result"),
    ]);
    expect(bloqueia(s, TIER)).toBe(true);
  });

  it("quiz completo passa sem nenhum achado", () => {
    expect(
      validarPublicacao(schema([b("q", "single-choice"), b("e", "email"), b("r", "result")]), TIER),
    ).toEqual([]);
  });

  it("faixa sem mensagem AVISA, não barra — é escolha legítima", () => {
    const semMsg: ScoreTier[] = [{ id: "t", label: "A", minPercent: 50 }] as ScoreTier[];
    const achados = validarPublicacao(schema([b("e", "email"), b("r", "result")]), semMsg);
    expect(achados.every((a) => a.nivel === "avisa")).toBe(true);
    expect(achados.some((a) => /WhatsApp/.test(a.mensagem))).toBe(true);
  });
});

describe("laço de saltos", () => {
  const base = (blocks: unknown[], steps: unknown[]) =>
    ({ blocks, steps, design: {} }) as unknown as QuizSchema;

  const captura = { id: "mail", type: "email", title: "E-mail" };

  it("bloqueia quando ida e volta por salto fecham o laço", () => {
    const schema = base(
      [
        captura,
        { id: "a", type: "single-choice", options: [{ id: "o1", label: "x", jumpToBlockId: "b" }] },
        { id: "b", type: "single-choice", options: [{ id: "o2", label: "y", jumpToBlockId: "a" }] },
      ],
      [
        { id: "s1", blockIds: ["mail"] },
        { id: "s2", blockIds: ["a"] },
        { id: "s3", blockIds: ["b"] },
      ],
    );
    const bloqueios = validarPublicacao(schema).filter((a) => a.nivel === "bloqueia");
    expect(bloqueios.some((a) => /laço de saltos/.test(a.mensagem))).toBe(true);
  });

  it("volta sem laço apenas avisa — 'responda de novo' é uso legítimo", () => {
    const schema = base(
      [
        captura,
        { id: "a", type: "heading" },
        { id: "b", type: "single-choice", options: [{ id: "o1", label: "x", jumpToBlockId: "a" }] },
      ],
      [
        { id: "s1", blockIds: ["mail"] },
        { id: "s2", blockIds: ["a"] },
        { id: "s3", blockIds: ["b"] },
      ],
    );
    const achados = validarPublicacao(schema);
    expect(achados.some((a) => a.nivel === "bloqueia" && /laço/.test(a.mensagem))).toBe(false);
    expect(
      achados.some((a) => a.nivel === "avisa" && /volta para uma etapa anterior/.test(a.mensagem)),
    ).toBe(true);
  });

  it("funil só para frente não gera nenhum dos dois", () => {
    const schema = base(
      [
        captura,
        { id: "a", type: "single-choice", options: [{ id: "o1", label: "x", jumpToBlockId: "c" }] },
        { id: "b", type: "heading" },
        { id: "c", type: "heading" },
      ],
      [
        { id: "s1", blockIds: ["mail"] },
        { id: "s2", blockIds: ["a"] },
        { id: "s3", blockIds: ["b"] },
        { id: "s4", blockIds: ["c"] },
      ],
    );
    const achados = validarPublicacao(schema);
    expect(achados.some((a) => /laço|volta para uma etapa/.test(a.mensagem))).toBe(false);
  });
});

describe("variável que não resolve na mensagem", () => {
  const comVariaveis = (template: string) =>
    validarPublicacao(
      {
        blocks: [
          { id: "mail", type: "email", title: "E-mail" },
          { id: "q", type: "single-choice", outputVariable: "dor_principal", options: [] },
        ],
        steps: [{ id: "s1", blockIds: ["mail", "q"] }],
        design: {},
      } as unknown as QuizSchema,
      [{ id: "t", label: "A", minPercent: 0, whatsappTemplate: template }] as never,
    );

  it("avisa quando o nome não existe — é o que vira buraco na mensagem", () => {
    const a = comVariaveis("Sobre {{dor_pricipal}}");
    expect(a.some((x) => x.nivel === "avisa" && /dor_pricipal/.test(x.mensagem))).toBe(true);
  });

  it("não avisa com as embutidas nem com variável de saída existente", () => {
    const a = comVariaveis("Olá {{nome}}, faixa {{faixa}}, dor {{dor_principal}}");
    expect(a.some((x) => /não existe no quiz/.test(x.mensagem))).toBe(false);
  });

  it("avisa, não bloqueia: a mensagem ainda sai, só incompleta", () => {
    const a = comVariaveis("{{inexistente}}");
    const achado = a.find((x) => /não existe no quiz/.test(x.mensagem));
    expect(achado?.nivel).toBe("avisa");
  });
});
