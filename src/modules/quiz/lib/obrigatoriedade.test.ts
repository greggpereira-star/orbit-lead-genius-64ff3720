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
     versão deste teste mirou nela e falhou por olhar o lugar errado.

     O fim é o próximo marco do arquivo, não uma contagem de caracteres. Era
     1600 fixo, e bastou a função crescer um ramo para a fatia parar antes do
     fim — um teste que passa a olhar menos do que pensa que olha não avisa
     ninguém de que parou de cobrir. */
  const canSubmit = player.slice(
    player.indexOf("const canSubmit"),
    player.indexOf("onValidChange?.(canSubmit)"),
  );

  it("escolha única: o player só afrouxa com `required === false`", () => {
    expect(canSubmit).toContain("block.required === false");
  });

  it("múltipla escolha: o player só exige com `required` verdadeiro", () => {
    expect(canSubmit).toContain("multi.length > 0 || !block.required");
  });

  it("o interruptor mostra o padrão de CADA tipo", () => {
    // Pela LISTA compartilhada, não pela forma da expressão: a versão anterior
    // casava o texto `block.type === "single-choice" ? ...` e quebrou quando o
    // mesmo comportamento passou a sair de um conjunto nomeado. Teste preso à
    // escrita reprova refatoração correta e não pega defeito nenhum.
    expect(inspetor).toContain("OBRIGATORIO_POR_PADRAO.has(block.type)");
    expect(inspetor).toContain("? block.required !== false");
  });
});

/**
 * Varredura das duas pontas: o que o player EXIGE e o que o inspetor OFERECE.
 *
 * O defeito da escolha única (interruptor sem efeito) e o da nota (efeito sem
 * interruptor) são o mesmo defeito visto dos dois lados — duas listas de tipo
 * que precisam concordar e nada obriga. A nota era pior: `canSubmit` nem olhava
 * `block.required`, então toda nota era obrigatória e não havia como soltar.
 * Numa pergunta de satisfação no meio do funil, parada forçada custa conclusão.
 */
describe("exigir e oferecer andam juntos", () => {
  const canSubmit = player.slice(
    player.indexOf("const canSubmit"),
    player.indexOf("onValidChange?.(canSubmit)"),
  );

  const exigidosPeloPlayer = new Set(
    [...canSubmit.matchAll(/block\.type === '([a-z-]+)'/g)].map((m) => m[1]),
  );

  const lista = (fonte: string, nome: string): Set<string> => {
    const i = fonte.indexOf(nome);
    if (i < 0) throw new Error(`não achei ${nome}`);
    const trecho = fonte.slice(i, fonte.indexOf("]", i));
    return new Set([...trecho.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]));
  };

  const oferecidosSemOpcao = lista(inspetor, "const honraObrigatorio = [");
  const padraoLigado = lista(inspetor, "const OBRIGATORIO_POR_PADRAO = new Set([");
  /* Escolha única e múltipla têm interruptor próprio, no bloco de opções. */
  const oferecidos = new Set([...oferecidosSemOpcao, "single-choice", "multi-choice"]);

  /**
   * Exigidos que NÃO ganham interruptor, com o motivo registrado. Tipo novo
   * nesta situação tem que entrar aqui com razão escrita, ou ser oferecido.
   */
  const SEM_INTERRUPTOR: Record<string, string> = {
    weight: "a régua nasce com número (70), nunca fica vazia: não há o que exigir",
    height: "a régua nasce com número (170), mesma razão",
    form: "quem manda são os interruptores de campo (nome/e-mail/telefone), não `required`",
    reveal: "revelar É a interação do bloco; exigir outra coisa não faria sentido",
  };

  it("a varredura achou os ramos de verdade", () => {
    // Sem isto, um `canSubmit` reescrito devolveria conjunto vazio e tudo
    // abaixo passaria sem checar nada.
    expect(exigidosPeloPlayer.size).toBeGreaterThanOrEqual(12);
    expect(oferecidos.size).toBeGreaterThanOrEqual(8);
  });

  it("tudo que o player exige, o inspetor oferece ou tem motivo escrito", () => {
    const mudos = [...exigidosPeloPlayer].filter((t) => !oferecidos.has(t) && !SEM_INTERRUPTOR[t]);
    expect(mudos, `exigidos sem interruptor nem motivo: ${mudos.join(", ")}`).toEqual([]);
  });

  it("nada é oferecido sem o player exigir — interruptor sem efeito é mentira", () => {
    const inuteis = [...oferecidos].filter((t) => !exigidosPeloPlayer.has(t));
    expect(inuteis, `oferecidos sem efeito: ${inuteis.join(", ")}`).toEqual([]);
  });

  it("todo tipo de padrão ligado afrouxa com `required === false` no player", () => {
    for (const tipo of padraoLigado) {
      const i = canSubmit.indexOf(`block.type === '${tipo}'`);
      expect(i, `${tipo} não aparece em canSubmit`).toBeGreaterThan(-1);
      expect(canSubmit.slice(i, i + 260), tipo).toContain("block.required === false");
    }
  });

  it("nenhuma exceção sobrevive depois que o player para de exigir o tipo", () => {
    const obsoletas = Object.keys(SEM_INTERRUPTOR).filter((t) => !exigidosPeloPlayer.has(t));
    expect(obsoletas, `exceções obsoletas: ${obsoletas.join(", ")}`).toEqual([]);
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
