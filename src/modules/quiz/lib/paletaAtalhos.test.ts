import { describe, it, expect } from "vitest";
import { BLOCK_LIBRARY } from "../blocks-library";
import type { QuizBlock } from "../types";

/**
 * "Sim / Não" e "Número" são atalhos: produzem uma `single-choice` e um
 * `short-text` já configurados, e não tipos novos. Dois itens de paleta passam
 * a dividir o mesmo `type`, e isso tem três consequências que não dão erro
 * nenhum na tela — por isso os testes abaixo.
 */
describe("atalhos de paleta", () => {
  const idDe = (d: { id?: string; type: string }) => d.id ?? d.type;

  it("cada item de paleta tem identidade única", () => {
    // Chave de React e `draggableId` saem daqui: repetido, o arrastar entrega
    // o bloco errado.
    const ids = BLOCK_LIBRARY.map(idDe);
    const repetidos = ids.filter((v, i) => ids.indexOf(v) !== i);
    expect(repetidos).toEqual([]);
  });

  it("a busca por tipo devolve o genérico, não o atalho", () => {
    // `BLOCK_LIBRARY.find(d => d.type === block.type)` dá o rótulo e o ícone no
    // inspetor e na lista de etapas. Se o atalho viesse antes, toda escolha
    // única passaria a se chamar "Sim / Não".
    expect(BLOCK_LIBRARY.find((d) => d.type === "single-choice")!.label).toBe("Escolha única");
    expect(BLOCK_LIBRARY.find((d) => d.type === "short-text")!.label).toBe("Texto curto");
  });

  it("Sim / Não nasce com exatamente duas opções", () => {
    const d = BLOCK_LIBRARY.find((x) => idDe(x) === "sim-nao")!;
    const b = d.create() as QuizBlock;
    expect(b.options?.map((o) => o.label)).toEqual(["Sim", "Não"]);
  });

  it("Número nasce com a máscara numérica", () => {
    const d = BLOCK_LIBRARY.find((x) => idDe(x) === "numero")!;
    const b = d.create() as QuizBlock;
    expect(b.type).toBe("short-text");
    expect(b.fieldMask).toBe("numero");
  });

  it("todo item de paleta produz um bloco do tipo que ele declara", () => {
    for (const d of BLOCK_LIBRARY) {
      const b = d.create() as QuizBlock;
      expect(b.type, `${idDe(d)} declara ${d.type} e cria ${b.type}`).toBe(d.type);
    }
  });
});
