import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * A linha da opção tem um conteúdo — o texto — e o resto é ferramenta.
 *
 * O defeito que isto trava: negrito, itálico e sublinhado ficavam SEMPRE na
 * linha, somados à alça, ao chip de mídia, ao expandir, ao duplicar e ao
 * excluir. Medido com o CSS compilado em 13/10: num painel de 300px sobravam
 * 32px para o campo — zero caractere visível. O autor via uma caixa cinza vazia
 * e só descobria que o texto estava lá ao digitar, porque aí o campo rolava até
 * o cursor. Não era texto perdido; era campo espremido.
 *
 * Com as marcas fora da linha, o mesmo painel dá 158px (16 caracteres).
 *
 * Em vez de contar pixels aqui — que dependeria de rodar navegador —, o teste
 * limita o que PODE disputar a linha. É a causa, não o sintoma.
 */
const fonte = readFileSync("src/modules/quiz/components/QuizInspector.tsx", "utf8");

/** A primeira linha flex de `OptionEditor`: alça, chip, campo e o que sobrar. */
const linhaDaOpcao = (): string => {
  const i = fonte.indexOf("function OptionEditor(");
  if (i < 0) throw new Error("não achei OptionEditor");
  const j = fonte.indexOf('<div className="flex items-center gap-1.5 p-1.5">', i);
  if (j < 0) throw new Error("não achei a linha da opção");
  const fim = fonte.indexOf("\n      </div>", j);
  return fonte.slice(j, fim);
};

describe("a linha da opção não espreme o campo de texto", () => {
  const linha = linhaDaOpcao();

  it("o teste está olhando a linha certa", () => {
    // Guarda contra o próprio varredor: fatia errada passaria vazia.
    expect(linha).toContain("labelInputRef");
    expect(linha.length).toBeGreaterThan(200);
  });

  it("no máximo dois controles depois do campo", () => {
    // Expandir e excluir. Cada botão a mais come ~26px do texto.
    const controles = (linha.match(/<(button|Button)\b/g) ?? []).length;
    expect(controles, `a linha tem ${controles} controles`).toBeLessThanOrEqual(2);
  });

  it("as marcas de formatação saíram da linha", () => {
    for (const marca of ["Bold", "Italic", "Underline"]) {
      expect(linha, `${marca} voltou para a linha`).not.toContain(`<${marca} `);
    }
  });

  it("duplicar saiu da linha — é ação secundária", () => {
    expect(linha).not.toContain("onDuplicate");
    expect(fonte, "duplicar sumiu de vez").toContain("Duplicar opção");
  });

  it("o campo pode encolher sem empurrar os vizinhos", () => {
    expect(linha).toContain('className="h-8 min-w-0"');
  });
});

describe("a barra de marcas aparece quando serve", () => {
  it("ao focar o campo, e enquanto a opção está aberta", () => {
    expect(fonte).toContain("onFocus={() => setEditandoRotulo(true)}");
    expect(fonte).toContain("{(editandoRotulo || expanded) && (");
  });

  it("clicar numa marca não tira o foco do campo", () => {
    /* Sem `preventDefault` no mousedown, o clique tira o foco ANTES do
       `onClick`: a barra some junto e a seleção se perde, então o botão marca
       o lugar errado — ou lugar nenhum. */
    const i = fonte.indexOf("applyMark(marca)");
    expect(i, "não achei o botão de marca").toBeGreaterThan(0);
    expect(fonte.slice(i - 400, i)).toContain("onMouseDown={(e) => e.preventDefault()}");
  });

  it("as três marcas continuam disponíveis", () => {
    for (const marca of ["bold", "italic", "underline"]) {
      expect(fonte, `${marca} sumiu`).toContain(`marca: "${marca}"`);
    }
  });
});
