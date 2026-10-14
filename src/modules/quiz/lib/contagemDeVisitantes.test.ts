import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  contarVisitantes,
  taxaDeConclusao,
  visitantesPorBloco,
  type EventoContavel,
  type EventoDeBloco,
} from "./contagemDeVisitantes";

/**
 * O defeito: a taxa de conversão do quiz contava EVENTOS `start`, e o `start`
 * dispara a cada carregamento da página.
 *
 * A sessão sobrevive ao carregamento DE PROPÓSITO — a retomada guarda o
 * `sessionId` junto do progresso para que quem volta continue sendo o mesmo
 * lead, em vez de virar um lead novo. As duas coisas juntas faziam quem voltava
 * para terminar virar dois visitantes com uma conclusão só.
 *
 * Medido na base em 14/10: 35 eventos `start` para 28 sessões. A taxa saía
 * 8/35 = 22,9% quando a verdade era 8/28 = 28,6%. Um quarto de subestimação —
 * e no número que decide se o funil fica no ar ou volta para a prancheta, um
 * erro para BAIXO é o mais caro: faz desistir do que estava funcionando.
 */
const e = (event_type: string, session_id?: string | null): EventoContavel => ({
  event_type,
  session_id,
});

describe("contarVisitantes", () => {
  it("a mesma sessão, várias vezes, é um visitante", () => {
    const eventos = [e("start", "s1"), e("start", "s1"), e("start", "s1")];
    expect(contarVisitantes(eventos, "start")).toBe(1);
  });

  it("sessões diferentes são visitantes diferentes", () => {
    expect(contarVisitantes([e("start", "s1"), e("start", "s2")], "start")).toBe(2);
  });

  it("só conta o tipo pedido", () => {
    const eventos = [e("start", "s1"), e("complete", "s1"), e("block_view", "s1")];
    expect(contarVisitantes(eventos, "start")).toBe(1);
    expect(contarVisitantes(eventos, "complete")).toBe(1);
  });

  it("evento sem sessão conta como visitante próprio, e não é descartado", () => {
    /* `session_id` só passou a ser gravado em 05/10/2026. Jogar fora o
       histórico anterior faria a métrica despencar numa data em que nada
       aconteceu — e um degrau falso é pior que um número levemente inflado,
       porque parece sinal. */
    const eventos = [e("start", null), e("start", undefined), e("start", "   "), e("start", "s1")];
    expect(contarVisitantes(eventos, "start")).toBe(4);
  });

  it("o caso real medido: 35 eventos, 28 sessões", () => {
    const eventos: EventoContavel[] = [];
    for (let i = 0; i < 25; i++) eventos.push(e("start", `s${i}`));
    eventos.push(e("start", "r1"), e("start", "r1")); // voltou uma vez
    eventos.push(e("start", "r2"), e("start", "r2"), e("start", "r2")); // voltou duas
    for (let i = 0; i < 5; i++) eventos.push(e("start", "r3")); // voltou quatro
    expect(eventos.length).toBe(35);
    expect(contarVisitantes(eventos, "start")).toBe(28);
  });
});

describe("taxaDeConclusao", () => {
  it("é a conclusão sobre o visitante", () => {
    expect(taxaDeConclusao(28, 8)).toBeCloseTo(28.57, 1);
  });

  it("o erro que isto conserta, lado a lado", () => {
    const porEvento = (8 / 35) * 100;
    const porVisitante = taxaDeConclusao(28, 8)!;
    expect(porEvento).toBeCloseTo(22.86, 1);
    expect(porVisitante).toBeGreaterThan(porEvento);
  });

  it("sem visitante não há taxa — e zero diria outra coisa", () => {
    // Zero afirma "ninguém converteu". O certo é "ainda não dá para dizer".
    expect(taxaDeConclusao(0, 0)).toBeNull();
  });
});

describe("visitantesPorBloco", () => {
  const v = (block_id: string, session_id?: string | null): EventoDeBloco => ({
    event_type: "block_view",
    block_id,
    session_id,
  });

  it("a mesma sessão vendo o mesmo bloco várias vezes é um visitante", () => {
    // Quem volta uma etapa vê de novo; e o efeito reemitia a rajada quando o
    // `submissionId` mudava, no fim do quiz.
    expect(visitantesPorBloco([v("b1", "s1"), v("b1", "s1"), v("b1", "s1")]).get("b1")).toBe(1);
  });

  it("sessões diferentes somam", () => {
    expect(visitantesPorBloco([v("b1", "s1"), v("b1", "s2")]).get("b1")).toBe(2);
  });

  it("cada bloco tem a sua conta", () => {
    const r = visitantesPorBloco([v("b1", "s1"), v("b2", "s1"), v("b2", "s2")]);
    expect(r.get("b1")).toBe(1);
    expect(r.get("b2")).toBe(2);
  });

  it("ignora evento de outro tipo e sem bloco", () => {
    const outros = [
      { event_type: "start", session_id: "s1" },
      { event_type: "block_view", session_id: "s1", block_id: null },
    ] as EventoDeBloco[];
    expect(visitantesPorBloco(outros).size).toBe(0);
  });

  it("evento sem sessão conta como visitante próprio", () => {
    expect(visitantesPorBloco([v("b1", null), v("b1", null), v("b1", "s1")]).get("b1")).toBe(3);
  });

  it("o caso real medido: 219 eventos para 156 pares", () => {
    const eventos: EventoDeBloco[] = [];
    // 107 pares vistos 1x, 40 vistos 2x, 6 vistos 3x, 1 visto 4x, 2 vistos 5x
    let par = 0;
    const empurra = (vezes: number, quantos: number) => {
      for (let i = 0; i < quantos; i++) {
        par += 1;
        for (let k = 0; k < vezes; k++) eventos.push(v(`b${par}`, `s${par}`));
      }
    };
    empurra(1, 107);
    empurra(2, 40);
    empurra(3, 6);
    empurra(4, 1);
    empurra(5, 2);
    expect(eventos.length).toBe(219);
    expect(visitantesPorBloco(eventos).size).toBe(156);
  });
});

describe("o serviço usa a contagem por sessão", () => {
  const servico = readFileSync("src/modules/quiz/services/quizService.ts", "utf8");

  it("não conta mais eventos para visitante", () => {
    expect(servico, "voltou a contar evento").not.toContain(
      'evs.filter((e) => e.event_type === "start").length',
    );
    expect(servico).toContain('contarVisitantes(evs, "start")');
    expect(servico).toContain('contarVisitantes(evs, "complete")');
  });

  it("pede session_id ao banco — sem ele a contagem não teria o que deduplicar", () => {
    expect(servico).toContain('.select("event_type, block_id, created_at, session_id")');
  });

  it("o abandono por bloco conta visitantes, e não eventos", () => {
    /* O denominador é `starts`, que conta SESSÕES. Comparar sessões com
       eventos misturava as unidades e produzia abandono negativo, que o
       `Math.max(0, …)` escondia como 0% — a tela dizia "ninguém desistiu
       aqui" justamente onde a conta tinha quebrado. */
    expect(servico).toContain("visitantesPorBloco(evs)");
    expect(servico, "voltou a somar evento por bloco").not.toContain(
      "blockViews.set(e.block_id, (blockViews.get(e.block_id) ?? 0) + 1)",
    );
  });

  it("o player emite uma visualização por bloco, por visita", () => {
    const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
    expect(player).toContain("blocosJaVistos");
    const i = player.indexOf("eventType: 'block_view'");
    expect(player.slice(i - 400, i)).toContain("blocosJaVistos.current.has(b.id)");
  });

  it("o gráfico diário também deduplica por sessão", () => {
    /* Uma sessão que atravessa a virada do dia aparece nos dois dias, e isso
       está certo: ela visitou nos dois. O que não pode é aparecer duas vezes
       no MESMO dia. */
    expect(servico).toContain("sessoesPorDia");
  });
});
