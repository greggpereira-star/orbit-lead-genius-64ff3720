import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Todo tipo cuja validade consulta `block.required` precisa ter o interruptor
 * "Obrigatório" no inspetor.
 *
 * Sem ele o campo existe no schema, o player o respeita, e o autor não tem
 * como ligá-lo — o bloco fica permanentemente opcional. Era o caso de e-mail,
 * telefone, texto curto e longo, agendamento e vídeo: **um bloco de captura de
 * e-mail podia ser pulado**, e nada na tela dizia isso.
 *
 * O interruptor aparecia só em blocos com opções, onde `required` também é
 * consultado — por isso o defeito passou despercebido: nos blocos onde alguém
 * olhou, ele estava lá.
 */
const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
const inspetor = readFileSync("src/modules/quiz/components/QuizInspector.tsx", "utf8");

/** Os tipos citados dentro do `canSubmit` em ramos que leem `block.required`. */
const corpoDoCanSubmit = (() => {
  const i = player.indexOf("const canSubmit = useMemo(");
  const j = player.indexOf("}, [block, value", i);
  expect(i, "canSubmit não encontrado — reaponte o teste").toBeGreaterThan(-1);
  return player.slice(i, j);
})();

const tiposQueLeemRequired = [
  ...new Set(
    corpoDoCanSubmit
      .split(/\n\s*if \(/)
      .filter((ramo) => /block\.required/.test(ramo))
      .flatMap((ramo) => [...ramo.matchAll(/block\.type === '([a-z-]+)'/g)].map((m) => m[1])),
  ),
];

describe("obrigatório alcançável pelo autor", () => {
  it("encontrou os ramos que consultam required", () => {
    expect(tiposQueLeemRequired.length).toBeGreaterThanOrEqual(5);
  });

  it.each(tiposQueLeemRequired)("%s pode ser marcado como obrigatório", (tipo) => {
    const temOpcoes = ["single-choice", "multi-choice"].includes(tipo);
    const naLista = inspetor.includes(`"${tipo}"`);
    expect(
      temOpcoes || naLista,
      `${tipo} respeita \`required\` no player mas não aparece no inspetor: ` +
        `fica opcional para sempre e nada avisa`,
    ).toBe(true);
  });
});
