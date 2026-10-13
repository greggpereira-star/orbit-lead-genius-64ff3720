import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { montarResumo } from "./resumoDasRespostas";
import type { QuizBlock } from "../types";

/**
 * O bloco de Resumo repete ao visitante o que ele respondeu, e o autor pode
 * escolher quais perguntas aparecem — em `resumirBlocos`.
 *
 * O campo guardava ÍNDICE dentro da lista montada. Mas só entra na lista quem
 * FOI respondido: a posição 2 é uma pergunta para quem respondeu tudo e outra
 * para quem pulou uma. O mesmo filtro mostrava respostas diferentes para
 * visitantes diferentes — e ninguém teria descoberto tão cedo, porque nenhuma
 * tela gravava o campo. Medido em 13/10 no banco: zero ocorrências em 40
 * versões publicadas e 5 funis, então não havia dado a preservar.
 *
 * Agora guarda ID de bloco, que é estável por definição.
 */
const b = (o: Partial<QuizBlock>) => o as QuizBlock;

const blocos = [
  b({ id: "q1", type: "single-choice", title: "Primeira", options: [{ id: "o1", label: "A" }] }),
  b({ id: "q2", type: "short-text", title: "Segunda" }),
  b({ id: "q3", type: "short-text", title: "Terceira" }),
];

describe("cada linha do resumo sabe de qual bloco veio", () => {
  it("carrega o blockId", () => {
    expect(montarResumo(blocos, { q1: "o1" })[0].blockId).toBe("q1");
  });

  it("a posição NÃO identifica a pergunta — é por isso que o id existe", () => {
    // Quem respondeu as três: a terceira está na posição 2.
    const todas = montarResumo(blocos, { q1: "o1", q2: "x", q3: "y" });
    expect(todas[2].blockId).toBe("q3");

    // Quem pulou a segunda: a posição 2 nem existe, e a terceira virou a 1.
    const pulou = montarResumo(blocos, { q1: "o1", q3: "y" });
    expect(pulou).toHaveLength(2);
    expect(pulou[1].blockId).toBe("q3");

    // Um filtro guardando "2" acertaria num caso e erraria no outro.
    expect(todas[1].blockId).not.toBe(pulou[1].blockId);
  });
});

describe("o filtro e a interface", () => {
  const sumario = readFileSync("src/modules/quiz/components/blocosDeConteudo.tsx", "utf8");
  const inspetor = readFileSync("src/modules/quiz/components/QuizInspector.tsx", "utf8");

  it("o bloco filtra por id, não por posição", () => {
    expect(sumario).toContain("block.resumirBlocos!.includes(l.blockId)");
    expect(sumario, "voltou a filtrar por índice").not.toContain("includes(String(i))");
  });

  it("lista vazia continua significando TODAS", () => {
    // Marcar nada e marcar tudo dão no mesmo de propósito: um resumo vazio é
    // uma caixa dizendo "o que você nos contou" sem contar nada.
    expect(sumario).toContain("block.resumirBlocos?.length");
  });

  it("o inspetor oferece a escolha", () => {
    expect(inspetor).toContain("EscolhaDasPerguntasDoResumo");
    expect(inspetor).toContain("resumirBlocos:");
  });

  it("a escolha usa a MESMA lista de tipos que monta o resumo", () => {
    // Uma cópia aqui e outra no player é como o produto já perdeu o
    // "Obrigatório" da escolha única e a origem de lógica do vídeo-resposta.
    expect(inspetor).toContain("BLOCOS_QUE_PERGUNTAM");
    expect(inspetor).toContain('from "../lib/resumoDasRespostas"');
  });

  it("escolher todas grava `undefined`, e não a lista inteira", () => {
    // `undefined` é o que o bloco já entende como "todas"; gravar a lista
    // completa congelaria o resumo numa foto das perguntas de hoje, e uma
    // pergunta nova depois disso nunca apareceria.
    expect(inspetor).toContain("nova.length === perguntas.length ? undefined : nova");
  });
});
