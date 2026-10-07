import { describe, it, expect } from "vitest";
import { analisarFunil } from "./analisarFunil";
import type { QuizBlock, QuizSchema, QuizStep, ScoreTier } from "../types";
import type { ConversaoDaEtapa } from "./stepConversion";

const b = (id: string, type: string, extra: Record<string, unknown> = {}) =>
  ({ id, type, ...extra }) as unknown as QuizBlock;
const TIER: ScoreTier[] = [
  { id: "t", label: "A", minPercent: 50, whatsappTemplate: "Oi" },
] as ScoreTier[];

const completo = {
  schema: {
    blocks: [
      b("q", "single-choice", { options: [{ id: "o", label: "x", score: 5 }] }),
      b("e", "email"),
      b("r", "result"),
    ],
  } as QuizSchema,
  steps: [
    { id: "s1", blockIds: ["q"] },
    { id: "s2", blockIds: ["e"] },
    { id: "s3", blockIds: ["r"] },
  ] as QuizStep[],
  tiers: TIER,
};
const semDados: ConversaoDaEtapa[] = [
  { stepId: "s1", visitantes: 0, avancaram: 0, taxa: null, faixa: "sem-dados" },
];

describe("análise do funil", () => {
  it("toda conclusão cita um número", () => {
    // A tela promete "cada ponto cita o número que o sustenta"; se um achado
    // sair sem número, a promessa vira texto vazio.
    const r = analisarFunil({
      ...completo,
      conversao: semDados,
      metricas: { starts: 100, completions: 5, leadsCaptured: 1 },
    });
    for (const p of r.problemas) expect(p.detalhe).toMatch(/\d/);
  });

  it("sem dados, NÃO inventa conclusão de conversão", () => {
    const r = analisarFunil({ ...completo, conversao: semDados });
    expect(r.temDadosSuficientes).toBe(false);
    expect(r.problemas.some((p) => /queda/i.test(p.titulo))).toBe(false);
  });

  it("aponta a maior queda, com nome e número", () => {
    const conversao: ConversaoDaEtapa[] = [
      { stepId: "s1", visitantes: 20, avancaram: 18, taxa: 0.9, faixa: "super-alta" },
      { stepId: "s2", visitantes: 18, avancaram: 5, taxa: 5 / 18, faixa: "baixa" },
      { stepId: "s3", visitantes: 5, avancaram: 0, taxa: null, faixa: "sem-dados" },
    ];
    const r = analisarFunil({ ...completo, conversao });
    const queda = r.problemas.find((p) => /queda/i.test(p.titulo));
    expect(queda?.severidade).toBe("critico");
    expect(queda?.etapa).toBe(1);
    expect(queda?.detalhe).toMatch(/18 visitantes/);
  });

  it("conclui mas não vira lead é crítico", () => {
    const r = analisarFunil({
      ...completo,
      conversao: semDados,
      metricas: { starts: 50, completions: 10, leadsCaptured: 0 },
    });
    expect(r.problemas.some((p) => p.severidade === "critico" && /lead/i.test(p.titulo))).toBe(
      true,
    );
  });

  it("pega perguntas que não pontuam num quiz que classifica por faixa", () => {
    const schema = {
      blocks: [
        b("q1", "single-choice", { options: [{ id: "a", label: "a", score: 0 }] }),
        b("e", "email"),
        b("r", "result"),
      ],
    } as QuizSchema;
    const r = analisarFunil({ schema, steps: completo.steps, tiers: TIER, conversao: semDados });
    expect(r.problemas.some((p) => /não pontuam/i.test(p.titulo))).toBe(true);
  });

  it("captura na primeira etapa é apontada", () => {
    const steps = [
      { id: "s1", blockIds: ["e"] },
      { id: "s2", blockIds: ["q"] },
    ] as QuizStep[];
    const r = analisarFunil({ ...completo, steps, conversao: semDados });
    expect(r.problemas.some((p) => /valor/i.test(p.titulo) || /contato/i.test(p.titulo))).toBe(
      true,
    );
  });

  it("reconhece o que está funcionando", () => {
    const conversao: ConversaoDaEtapa[] = [
      { stepId: "s1", visitantes: 20, avancaram: 19, taxa: 0.95, faixa: "super-alta" },
      { stepId: "s2", visitantes: 19, avancaram: 0, taxa: null, faixa: "sem-dados" },
    ];
    const r = analisarFunil({
      ...completo,
      conversao,
      metricas: { starts: 20, completions: 10, leadsCaptured: 8 },
    });
    expect(r.funcionando.length).toBeGreaterThan(0);
    expect(r.funcionando.join(" ")).toMatch(/\d/);
  });

  it("os problemas vêm do mais grave ao menos", () => {
    const r = analisarFunil({
      ...completo,
      conversao: semDados,
      metricas: { starts: 50, completions: 10, leadsCaptured: 0 },
    });
    const ordem = { critico: 0, atencao: 1, sugestao: 2 } as const;
    const niveis = r.problemas.map((p) => ordem[p.severidade]);
    expect(niveis).toEqual([...niveis].sort((a, c) => a - c));
  });
});

describe("visitas x medição por etapa", () => {
  const base = {
    schema: { blocks: [], design: {} } as unknown as QuizSchema,
    steps: [],
    conversao: [],
  };

  it("devolve as visitas do período, não só quem tem medição por etapa", () => {
    /* O defeito que isto trava: a tela imprimia `visitantes` (medição por
       etapa, existente só desde 05/10/2026) sob o rótulo "visitantes (30d)".
       Um funil com 24 visitas e nenhuma sessão medida mostrava "0", e
       contradizia a tela de Performance e o cartão do quiz. */
    const a = analisarFunil({
      ...base,
      metricas: { starts: 24, completions: 2, leadsCaptured: 2 },
    });
    expect(a.inicios).toBe(24);
    expect(a.visitantes).toBe(0);
  });

  it("sem métricas, as visitas são zero e não indefinidas", () => {
    expect(analisarFunil(base).inicios).toBe(0);
  });
});
