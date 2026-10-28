import { describe, expect, it } from "vitest";
import { analisarFunil, type EtapaDoFunil } from "./funil";

const e = (o: Partial<EtapaDoFunil> & { nome: string }): EtapaDoFunil => ({
  stage_id: o.nome,
  kind: "open",
  ordem: 0,
  leads: 0,
  valor: 0,
  parados_24h: 0,
  horas_medias: null,
  ...o,
});

// O funil REAL de produção em 28/10/2026 (30 dias).
const producao = [
  e({ nome: "Novo lead", ordem: 0, leads: 178, parados_24h: 173, horas_medias: 374.1 }),
  e({ nome: "Primeiro contato", ordem: 1 }),
  e({ nome: "Qualificado", ordem: 2, leads: 3, parados_24h: 3, horas_medias: 441.7 }),
  e({ nome: "Visita agendada", ordem: 3 }),
  e({ nome: "Proposta enviada", ordem: 4 }),
  e({ nome: "Venda fechada", kind: "won", ordem: 5 }),
  e({ nome: "Perdido", kind: "lost", ordem: 6 }),
];

describe("analisarFunil", () => {
  it("com o funil real aponta o gargalo e os leads parados", () => {
    const a = analisarFunil(producao);
    expect(a.total).toBe(181);
    expect(a.gargalo).toEqual({ nome: "Novo lead", leads: 178, percentual: 98.3 });
    expect(a.parados).toEqual({ total: 176, etapa: "Novo lead", naEtapa: 173, horasMedias: 374.1 });
  });

  it("etapa pequena continua visível: piso de 2% na barra, e zero some", () => {
    const l = analisarFunil(producao).linhas;
    expect(l[2].percentual).toBe(1.7);
    expect(l[2].barra).toBe(2);
    expect(l[1].barra).toBe(0);
    expect(l[0].barra).toBeCloseTo(98.3);
  });

  it("não inventa gargalo com poucos leads nem com a base bem distribuída", () => {
    expect(analisarFunil([e({ nome: "A", leads: 5 })]).gargalo).toBeNull();
    const dist = analisarFunil([
      e({ nome: "A", leads: 40 }),
      e({ nome: "B", leads: 35 }),
      e({ nome: "C", leads: 25 }),
    ]);
    expect(dist.gargalo).toBeNull();
  });

  it("gargalo só vale para etapa ABERTA (todo mundo em 'ganho' é sucesso, não travamento)", () => {
    const a = analisarFunil([
      e({ nome: "Aberta", leads: 1 }),
      e({ nome: "Ganho", kind: "won", leads: 99 }),
    ]);
    expect(a.gargalo).toBeNull();
    expect(a.vendas.quantidade).toBe(99);
  });

  it("parado só conta em etapa aberta", () => {
    const a = analisarFunil([
      e({ nome: "Aberta", leads: 4, parados_24h: 2, horas_medias: 50 }),
      e({ nome: "Ganho", kind: "won", leads: 3, parados_24h: 3 }),
    ]);
    expect(a.parados?.total).toBe(2);
  });

  it("separa venda ganha, valor em negociação e perdidos", () => {
    const a = analisarFunil([
      e({ nome: "A", leads: 10, valor: 4000 }),
      e({ nome: "B", leads: 2, valor: 1000 }),
      e({ nome: "G", kind: "won", leads: 3, valor: 9000 }),
      e({ nome: "P", kind: "lost", leads: 4, valor: 8000 }),
    ]);
    expect(a.vendas).toEqual({ quantidade: 3, valor: 9000 });
    expect(a.emNegociacao).toEqual({ quantidade: 12, valor: 5000 }); // perdido não é negociação
    expect(a.perdidos).toBe(4);
  });

  it("aceita números como texto (o Postgres devolve numeric assim) e valores nulos", () => {
    const a = analisarFunil([
      {
        ...e({ nome: "A" }),
        leads: "12" as unknown as number,
        valor: "150.50" as unknown as number,
        parados_24h: null as unknown as number,
      },
    ]);
    expect(a.total).toBe(12);
    expect(a.emNegociacao.valor).toBe(150.5);
    expect(a.parados).toBeNull();
  });

  it("sem lead nenhum: tudo zerado, sem divisão por zero", () => {
    const a = analisarFunil(producao.map((x) => ({ ...x, leads: 0, parados_24h: 0 })));
    expect(a.total).toBe(0);
    expect(a.gargalo).toBeNull();
    expect(a.parados).toBeNull();
    expect(a.linhas.every((l) => l.percentual === 0 && l.barra === 0)).toBe(true);
  });
});
