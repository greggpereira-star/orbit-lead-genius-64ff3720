import { describe, expect, it } from "vitest";
import type { QuizStep } from "../types";
import { resumirParaCartao, type EventoDoCartao } from "./resumoDoCartao";

const AGORA = new Date("2026-10-29T12:00:00Z").getTime();
const diasAtras = (d: number) => new Date(AGORA - d * 86_400_000).toISOString();

const ev = (
  tipo: string,
  sessao: string,
  dias = 1,
  bloco: string | null = null,
): EventoDoCartao => ({
  quiz_id: "q",
  event_type: tipo,
  block_id: bloco,
  session_id: sessao,
  created_at: diasAtras(dias),
});

const steps: QuizStep[] = [
  { id: "s1", blockIds: ["b1"], name: "Objetivo" },
  { id: "s2", blockIds: ["b2"] },
  { id: "s3", blockIds: ["b3"] },
];

/** `n` sessões que chegam até a etapa de índice `ate` (0-based). */
function sessoesAte(prefixo: string, n: number, ate: number): EventoDoCartao[] {
  const out: EventoDoCartao[] = [];
  for (let i = 0; i < n; i++) {
    out.push(ev("start", `${prefixo}${i}`));
    for (let e = 0; e <= ate; e++) out.push(ev("block_view", `${prefixo}${i}`, 1, `b${e + 1}`));
  }
  return out;
}

describe("resumirParaCartao", () => {
  it("conta pessoa, não carregamento: o mesmo visitante que volta vale um", () => {
    const r = resumirParaCartao({
      eventos: [ev("start", "a"), ev("start", "a"), ev("start", "b")],
      submissoes: [],
      agora: AGORA,
    });
    expect(r.visitantes).toBe(2);
  });

  it("lead é quem deixou e-mail ou telefone, e a taxa usa visitantes como base", () => {
    const eventos = Array.from({ length: 10 }, (_, i) => ev("start", `s${i}`));
    const r = resumirParaCartao({
      eventos,
      submissoes: [
        {
          quiz_id: "q",
          status: "completed",
          created_at: diasAtras(1),
          answers: { _contact: { email: "a@b.c" } },
        },
        {
          quiz_id: "q",
          status: "completed",
          created_at: diasAtras(2),
          answers: { _contact: { phone: "27999" } },
        },
        { quiz_id: "q", status: "started", created_at: diasAtras(2), answers: {} },
      ],
      agora: AGORA,
    });
    expect(r.leads).toBe(2);
    expect(r.taxaDeLead).toBe(20);
  });

  it("variação só aparece quando o período anterior tem volume para servir de régua", () => {
    const pequeno = resumirParaCartao({
      eventos: [ev("start", "x", 40), ev("start", "y", 1), ev("start", "z", 1)],
      submissoes: [],
      agora: AGORA,
    });
    expect(pequeno.variacao).toBeNull();

    const anterior = Array.from({ length: 10 }, (_, i) => ev("start", `p${i}`, 40));
    const atual = Array.from({ length: 15 }, (_, i) => ev("start", `a${i}`, 3));
    const grande = resumirParaCartao({
      eventos: [...anterior, ...atual],
      submissoes: [],
      agora: AGORA,
    });
    expect(grande.variacao).toBe(50);
  });

  it("sem nenhum início (quiz antigo) o lead vira o denominador, como a lista já fazia", () => {
    const r = resumirParaCartao({
      eventos: [],
      submissoes: [
        {
          quiz_id: "q",
          status: "completed",
          created_at: diasAtras(1),
          answers: { _contact: { email: "a@b.c" } },
        },
      ],
      agora: AGORA,
    });
    expect(r.visitantes).toBe(1);
    expect(r.taxaDeLead).toBe(100);
    expect(r.amostraPequena).toBe(true);
  });

  it("aponta a etapa que mais perde, com o nome dado pelo autor", () => {
    // 10 chegam à etapa 1; só 4 passam dela; os 4 seguem até o fim.
    const eventos = [...sessoesAte("a", 6, 0), ...sessoesAte("b", 4, 2)];
    const r = resumirParaCartao({ eventos, submissoes: [], steps, agora: AGORA });
    expect(r.maiorPerda).toEqual({
      numero: 1,
      nome: "Objetivo",
      percentualQueSai: 60,
      visitantes: 10,
    });
    expect(r.mapa).toHaveLength(3);
    expect(r.mapa[0]).toMatchObject({ percentualQueAvancou: 40, faixa: "media" });
  });

  it("não nomeia culpado com amostra pequena nem quando todos avançam", () => {
    const poucos = resumirParaCartao({
      eventos: sessoesAte("a", 3, 0),
      submissoes: [],
      steps,
      agora: AGORA,
    });
    expect(poucos.maiorPerda).toBeNull();
    expect(poucos.mapa).toEqual([]);

    const todosAvancam = resumirParaCartao({
      eventos: sessoesAte("a", 10, 2),
      submissoes: [],
      steps,
      agora: AGORA,
    });
    expect(todosAvancam.maiorPerda).toBeNull();
  });
});
