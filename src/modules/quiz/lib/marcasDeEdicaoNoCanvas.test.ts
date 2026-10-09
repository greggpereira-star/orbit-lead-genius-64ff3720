import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * A prévia do construtor mostra o quiz como o visitante vai ver: é dela que
 * saem a quebra de linha real e a marca da dobra. Marca de edição — alça de
 * arraste, selo de condicional — é andaime do autor, não faz parte do quiz, e
 * portanto não pode ocupar a área onde o conteúdo é lido.
 *
 * O defeito que isto trava: a alça ficava em `absolute left-1 top-1`, DENTRO
 * do recuo do bloco. Com 28px de alça (4 de margem + 6 de recuo + 16 de ícone)
 * sobre um conteúdo que começa aos 12px, ela cobria 20px do texto — e como
 * estava em `opacity-40`, cobria o tempo todo, não só no hover. Na captura de
 * 08/10 a primeira letra de "Qual seu principal objetivo?" estava tampada.
 *
 * Abrir recuo no bloco para a alça caber seria pior: empurraria o conteúdo e a
 * prévia passaria a mentir sobre a quebra de linha e a dobra. Quem sai da
 * caixa é a marca de edição, para a calha que o canvas já tem.
 *
 * As contas abaixo são lidas do próprio código, não escritas à mão: se alguém
 * estreitar a calha, engordar a alça ou trazê-la para dentro, isto quebra.
 */
const fonte = readFileSync("src/modules/quiz/components/QuizPreview.tsx", "utf8");

/** `p-3` → 12. Tailwind conta em múltiplos de 4px. */
const emPx = (classe: string, prefixo: string): number => {
  const m = classe.match(new RegExp(`(?:^|\\s)-?${prefixo}-(\\d+(?:\\.\\d+)?)(?:\\s|$)`));
  if (!m) throw new Error(`não achei "${prefixo}-N" em: ${classe}`);
  return parseFloat(m[1]) * 4;
};

/** O `className` que CONTÉM o trecho — por isso a busca anda para trás. */
const classeDa = (trecho: string): string => {
  const i = fonte.indexOf(trecho);
  if (i < 0) throw new Error(`não achei o trecho: ${trecho}`);
  const j = fonte.lastIndexOf("className=", i);
  if (j < 0) throw new Error(`trecho fora de um className: ${trecho}`);
  const m = fonte.slice(j).match(/className=\{?`?"?([^"`]+)/);
  if (!m) throw new Error(`não consegui ler o className de: ${trecho}`);
  return m[1];
};

/** O `className` do elemento que vem DEPOIS do trecho (ex.: um spread). */
const classeDepoisDe = (trecho: string): string => {
  const i = fonte.indexOf(trecho);
  if (i < 0) throw new Error(`não achei o trecho: ${trecho}`);
  const m = fonte.slice(i).match(/className=\{?`?"?([^"`]+)/);
  if (!m) throw new Error(`não achei className depois de: ${trecho}`);
  return m[1];
};

describe("marcas de edição no canvas", () => {
  const caixaDoBloco = classeDa("group relative cursor-pointer");
  const calhaDoCanvas = classeDa("min-h-[200px]");
  // Localizada pelo que ela É (carrega o `dragHandleProps`), nunca pela
  // posição atual — senão o teste só confirmaria o que já está escrito.
  const alca = classeDepoisDe("{...dragProvided.dragHandleProps}");

  const recuoDoBloco = emPx(caixaDoBloco, "p");
  const calha = emPx(calhaDoCanvas, "p");
  const larguraDaAlca = emPx(alca, "w");
  const deslocamentoDaAlca = emPx(alca, "left");

  it("a alça é deslocada para FORA da caixa do bloco", () => {
    expect(alca).toMatch(/(?:^|\s)-left-/);
  });

  it("o deslocamento tira a alça inteira de cima do conteúdo", () => {
    // Deslocada em N px para a esquerda, ela ocupa de -N a -N+largura.
    // Para não encostar na borda do bloco: deslocamento >= largura.
    expect(deslocamentoDaAlca).toBeGreaterThanOrEqual(larguraDaAlca);
  });

  it("a calha do canvas comporta a alça, senão ela seria cortada", () => {
    expect(calha).toBeGreaterThanOrEqual(deslocamentoDaAlca);
  });

  it("a marca de condicional em repouso cabe dentro do recuo do bloco", () => {
    // Em repouso o condicional é só um traço na borda. Enquanto ele for mais
    // estreito que o recuo, não encosta no texto.
    const traco = classeDa("pointer-events-none absolute inset-y-2 left-0");
    const largura = parseFloat(traco.match(/w-\[(\d+(?:\.\d+)?)px\]/)![1]);
    expect(largura).toBeLessThan(recuoDoBloco);
  });

  it("o selo escrito de condicional não fica permanente sobre o conteúdo", () => {
    // Ele voltou para a calha de cima e só aparece no hover. Se alguém o
    // trouxer de volta para dentro, com offset positivo, isto acusa.
    const selo = fonte.slice(fonte.indexOf("condicional\n") - 900, fonte.indexOf("condicional\n"));
    expect(selo).toMatch(/-top-\d/);
    expect(selo).toMatch(/opacity-0/);
    expect(selo).toMatch(/group-hover:opacity-100/);
  });

  it("nenhuma marca de edição volta para o canto de dentro do bloco", () => {
    expect(fonte).not.toMatch(/absolute (?:left|right)-1 top-1/);
  });
});
