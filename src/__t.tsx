import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * Obrigatoriedade por tipo de bloco.
 *
 * Os dois tipos com opção têm padrões OPOSTOS, e isso não é descuido: escolha
 * única sem resposta não é meia resposta, enquanto "marque quantas quiser"
 * admite marcar nenhuma. O que estava errado era a interface — um interruptor
 * só, lendo `required === true` para ambos: toda escolha única aparecia
 * desligada enquanto se comportava como ligada, e ligar ou desligar não mudava
 * nada na tela.
 *
 * O conserto lê `=== false` no player em vez de `=== true`. É isso que
 * preserva o que já está no ar: nos quizzes publicados o campo nunca foi
 * gravado, e `undefined` continua significando obrigatório, como sempre se
 * comportou. Trocar o sentido do padrão tornaria opcional toda pergunta de
 * todo funil publicado.
 */
const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
const inspetor = readFileSync("src/modules/quiz/components/QuizInspector.tsx", "utf8");

describe("padrão de obrigatoriedade", () => {
  /* Fatia a partir de `canSubmit`, e não da primeira menção ao tipo: a
     primeira é o valor pré-selecionado, noutro ponto do arquivo. A primeira
     versão deste teste mirou nela e falhou por olhar o lugar errado. */
  const canSubmit = player.slice(
    player.indexOf("const canSubmit"),
    player.indexOf("const canSubmit") + 1600,
  );

  it("escolha única: o player só afrouxa com `required === false`", () => {
    expect(canSubmit).toContain("block.required === false");
  });

  it("múltipla escolha: o player só exige com `required` verdadeiro", () => {
    expect(canSubmit).toContain("multi.length > 0 || !block.required");
  });

  it("o interruptor mostra o padrão de CADA tipo", () => {
    expect(inspetor).toContain('block.type === "single-choice" ? block.required !== false');
  });
});

describe("o que o CSV exporta e o que o player coleta não podem divergir", () => {
  /* Listas paralelas de tipo de bloco são o jeito mais silencioso de perder
     resposta: o player coleta, o CSV não exporta, e ninguém percebe até alguém
     abrir a planilha procurando uma coluna que nunca existiu. */
  const csv = readFileSync("src/modules/quiz/lib/csvDeRespostas.ts", "utf8");
  const bloco = csv.slice(csv.indexOf("COLETAM_RESPOSTA"), csv.indexOf("])"));
  const exportados = [...bloco.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);

  const coletadosPeloPlayer = [
    "single-choice",
    "multi-choice",
    "rating",
    "short-text",
    "long-text",
    "email",
    "phone",
    "weight",
    "height",
    "form",
    "scheduling",
    "video-answer",
  ];

  for (const tipo of coletadosPeloPlayer) {
    it(`${tipo}: o player coleta, então o CSV exporta`, () => {
      expect(exportados).toContain(tipo);
    });
  }

  it("o player realmente devolve valor para cada um deles", () => {
    const draft = player.slice(
      player.indexOf("const draftValue"),
      player.indexOf("const draftValue") + 800,
    );
    for (const tipo of coletadosPeloPlayer) {
      expect(draft, tipo).toContain(`'${tipo}'`);
    }
  });
});
