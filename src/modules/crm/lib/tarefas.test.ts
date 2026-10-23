import { describe, expect, it } from "vitest";
import { agruparPorSituacao, contarAbertas, ehTarefa, ordenarTarefas, prazosRapidos, rotuloDoPrazo } from "./tarefas";

const agora = new Date(2026, 9, 23, 14, 0, 0); // 23/10/2026 14:00 local
const em = (min: number) => new Date(agora.getTime() + min * 60_000).toISOString();

describe("ehTarefa", () => {
  it("só anotação com data é tarefa", () => {
    expect(ehTarefa({ scheduled_for: em(60) })).toBe(true);
    expect(ehTarefa({ scheduled_for: null })).toBe(false);
  });
});

describe("prazos rápidos", () => {
  it("hoje 18h aparece se ainda falta bastante", () => {
    const r = prazosRapidos(agora);
    expect(r.map((x) => x.id)).toEqual(["hoje", "amanha", "3dias", "semana"]);
    expect(r[0].quando.getHours()).toBe(18);
    expect(r[1].quando.getDate()).toBe(24);
    expect(r[1].quando.getHours()).toBe(9);
    expect(r[2].quando.getDate()).toBe(26);
    expect(r[3].quando.getDate()).toBe(30);
  });

  it("depois das 17h45 'Hoje, 18h' some: tarefa não nasce atrasada", () => {
    const tarde = new Date(2026, 9, 23, 17, 50, 0);
    expect(prazosRapidos(tarde).map((x) => x.id)).toEqual(["amanha", "3dias", "semana"]);
  });
});

describe("rotuloDoPrazo", () => {
  it("até 24 h: horas e minutos, nunca minutos brutos", () => {
    expect(rotuloDoPrazo({ scheduled_for: em(130), done: false }, agora)).toEqual({
      texto: "em 2 h 10 min",
      situacao: "hoje",
    });
    expect(rotuloDoPrazo({ scheduled_for: em(-45), done: false }, agora)).toEqual({
      texto: "há 45 min",
      situacao: "atrasada",
    });
    expect(rotuloDoPrazo({ scheduled_for: em(-1246), done: false }, agora).texto).toBe(
      "há 20 h 46 min",
    );
  });

  it("a partir de 24 h mostra a data", () => {
    const r = rotuloDoPrazo({ scheduled_for: em(3 * 24 * 60), done: false }, agora);
    expect(r.texto).toMatch(/^26\/10 14:00$/);
    expect(r.situacao).toBe("futura");
    expect(rotuloDoPrazo({ scheduled_for: em(-3 * 24 * 60), done: false }, agora).situacao).toBe(
      "atrasada",
    );
  });

  it("feita e sem prazo", () => {
    expect(rotuloDoPrazo({ scheduled_for: em(60), done: true }, agora).situacao).toBe("feita");
    expect(rotuloDoPrazo({ scheduled_for: null, done: false }, agora).situacao).toBe("sem_prazo");
  });
});

describe("ordenar e contar", () => {
  const lista = [
    { id: "a", scheduled_for: em(300), done: false, done_at: null },
    { id: "b", scheduled_for: em(-60), done: false, done_at: null },
    { id: "c", scheduled_for: em(-600), done: true, done_at: em(-500) },
    { id: "d", scheduled_for: em(-700), done: true, done_at: em(-100) },
    { id: "e", scheduled_for: em(60), done: false, done_at: null },
  ];

  it("abertas por prazo (atrasada primeiro), feitas no fim, a mais recente antes", () => {
    expect(ordenarTarefas(lista).map((x) => x.id)).toEqual(["b", "e", "a", "d", "c"]);
  });

  it("conta abertas e atrasadas, ignorando feitas e anotações sem data", () => {
    const r = contarAbertas([...lista, { scheduled_for: null, done: false }], agora);
    expect(r.abertas).toBe(3);
    expect(r.atrasadas).toBe(1);
  });
});

describe("agrupar por situação", () => {
  it("atrasadas, hoje e próximas (só abertas), cada grupo por prazo", () => {
    const g = agruparPorSituacao(
      [
        { id: "futura", scheduled_for: em(3 * 24 * 60), done: false, done_at: null },
        { id: "hoje2", scheduled_for: em(300), done: false, done_at: null },
        { id: "hoje1", scheduled_for: em(60), done: false, done_at: null },
        { id: "atrasada", scheduled_for: em(-120), done: false, done_at: null },
        { id: "feita", scheduled_for: em(-120), done: true, done_at: em(-10) },
        { id: "nota", scheduled_for: null, done: false, done_at: null },
      ],
      agora,
    );
    expect(g.atrasadas.map((x) => x.id)).toEqual(["atrasada"]);
    expect(g.hoje.map((x) => x.id)).toEqual(["hoje1", "hoje2"]);
    expect(g.proximas.map((x) => x.id)).toEqual(["futura"]);
  });
});

