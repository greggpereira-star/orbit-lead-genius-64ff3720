import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { destinoComoEtapa } from "./edicaoDeSalto";
import type { QuizStep } from "../types";

/**
 * Destino de salto é ETAPA, não bloco.
 *
 * Relato com captura em 13/10: ao configurar o salto, o seletor de destino
 * trazia dezenas de linhas — títulos, parágrafos, depoimentos, frases inteiras
 * de prova social —, com textos longos e REPETIDOS, sem dizer de que etapa
 * cada uma era. Quatro "Perfil — Harmonia Facial Individual" seguidos.
 *
 * Eram blocos do próprio quiz, não de outro. Mas o problema não era o tamanho
 * da lista: era oferecer uma escolha que não existe. Quem navega é a etapa —
 * `findStepIndexForBlock` leva o visitante para a etapa que CONTÉM o bloco —,
 * então apontar para o terceiro bloco da etapa 5 faz exatamente o mesmo que
 * apontar para o primeiro. A lista mostrava quatro destinos diferentes para um
 * destino só.
 *
 * O salto por OPÇÃO já tinha sido corrigido assim nesta auditoria; o seletor de
 * REGRA ficou para trás. Duas implementações da mesma coisa, de novo.
 */
const etapas: QuizStep[] = [
  { id: "s1", blockIds: ["a1", "a2"] },
  { id: "s2", blockIds: ["b1", "b2", "b3"] },
  { id: "s3", blockIds: [] },
] as unknown as QuizStep[];

describe("destinoComoEtapa", () => {
  it("qualquer bloco da etapa representa a etapa", () => {
    // É o que torna as quatro linhas repetidas uma linha só.
    expect(destinoComoEtapa(etapas, "b1")).toBe("b1");
    expect(destinoComoEtapa(etapas, "b2")).toBe("b1");
    expect(destinoComoEtapa(etapas, "b3")).toBe("b1");
  });

  it("salto antigo apontando para o meio da etapa não fica em branco", () => {
    // Sem isto, um quiz já publicado mostraria o seletor vazio para um salto
    // que existe e funciona — e o autor concluiria que o salto se perdeu.
    expect(destinoComoEtapa(etapas, "b3")).not.toBe("");
  });

  it("sem destino, nada selecionado", () => {
    for (const v of [null, undefined, ""]) expect(destinoComoEtapa(etapas, v)).toBe("");
  });

  it("bloco que não existe mais não inventa destino", () => {
    expect(destinoComoEtapa(etapas, "sumiu")).toBe("");
  });

  it("etapa vazia não vira destino", () => {
    // Ela não tem bloco para representá-la, e mandar o visitante para uma tela
    // em branco é pior que não oferecer.
    expect(destinoComoEtapa(etapas, "s3")).toBe("");
  });
});

describe("os dois seletores de destino listam etapas", () => {
  const inspetor = readFileSync("src/modules/quiz/components/QuizInspector.tsx", "utf8");

  it("o de REGRA não lista mais todos os blocos", () => {
    const i = inspetor.indexOf("Escolha o destino");
    expect(i, "não achei o seletor de regra").toBeGreaterThan(0);
    const trecho = inspetor.slice(i - 1200, i + 600);
    expect(trecho, "voltou a listar blocos").not.toContain(
      "allBlocks.filter((b) => b.id !== block.id)",
    );
    expect(trecho).toContain("stepLabelFor");
  });

  it("o de regra exclui a própria etapa de origem", () => {
    // Saltar para a própria etapa é o laço que o validador de publicação já
    // bloqueia; oferecê-lo seria oferecer o erro para depois acusá-lo.
    expect(inspetor).toContain(
      "const etapaDaOrigem = steps.findIndex((s) => s.blockIds.includes(block.id))",
    );
  });

  it("os dois normalizam valor antigo pela mesma função", () => {
    const usos = inspetor.match(/destinoComoEtapa\(steps,/g) ?? [];
    expect(usos.length, "um dos seletores ficou sem normalizar").toBeGreaterThanOrEqual(2);
  });
});
