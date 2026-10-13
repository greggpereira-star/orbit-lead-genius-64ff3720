import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * Toda cor do tema claro precisa ter valor no escuro.
 *
 * Variável de cor definida só no `:root` mantém o valor CLARO quando a classe
 * `dark` entra — um pastel de fundo claro sobre superfície escura, que não
 * some: fica lá, ilegível, e só aparece em telas específicas. Ninguém percebe
 * ao adicionar; quem percebe é o cliente, meses depois.
 *
 * A checagem aceita duas formas de estar coberta, porque as duas existem no
 * `styles.css`:
 *
 * 1. redefinida dentro do bloco `.dark`;
 * 2. DERIVADA por `color-mix` de outra que é redefinida. As sete `-suave`,
 *    `-borda` e `-anel` são assim, e seguem o tema sozinhas porque custom
 *    property resolve no ponto de uso, não onde foi escrita. Foi medindo isto
 *    que descobri que o tema escuro já estava completo: 42 redefinidas mais 7
 *    derivadas cobrem as 49 cores.
 */
const css = readFileSync("src/styles.css", "utf8");

const bloco = (seletor: string): string => {
  const i = css.indexOf(seletor);
  if (i < 0) throw new Error(`não achei o bloco "${seletor}"`);
  let profundidade = 0;
  const abre = css.indexOf("{", i);
  let k = abre;
  for (;;) {
    if (css[k] === "{") profundidade++;
    else if (css[k] === "}" && --profundidade === 0) break;
    k++;
  }
  return css.slice(abre, k);
};

const declaracoes = (corpo: string): Map<string, string> =>
  new Map([...corpo.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

/** Não são cor: ficam de fora com o motivo escrito, não por esquecimento. */
const NAO_SAO_COR: Record<string, string> = {
  "--radius": "medida de canto arredondado, igual nos dois temas",
};

describe("tema escuro cobre o tema claro", () => {
  const claro = declaracoes(bloco(":root {"));
  const escuro = declaracoes(bloco(".dark {"));

  it("os dois blocos foram lidos de verdade", () => {
    // Guarda contra o parser: um seletor renomeado devolveria mapa vazio e
    // faria o teste principal passar sem checar nada.
    expect(claro.size).toBeGreaterThanOrEqual(40);
    expect(escuro.size).toBeGreaterThanOrEqual(40);
    expect(claro.has("--background")).toBe(true);
    expect(escuro.has("--background")).toBe(true);
  });

  it("toda cor do claro é redefinida no escuro ou deriva de uma que é", () => {
    const descobertas: string[] = [];
    for (const [nome, valor] of claro) {
      if (escuro.has(nome) || NAO_SAO_COR[nome]) continue;
      const bases = [...valor.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]);
      const derivaDeAlgoEscuro = bases.length > 0 && bases.every((b) => escuro.has(b));
      if (!derivaDeAlgoEscuro) descobertas.push(nome);
    }
    expect(descobertas, `sem valor no escuro: ${descobertas.join(", ")}`).toEqual([]);
  });

  it("o escuro não inventa variável que o claro não tem", () => {
    const sobrando = [...escuro.keys()].filter((n) => !claro.has(n));
    expect(sobrando, `só no escuro: ${sobrando.join(", ")}`).toEqual([]);
  });

  it("nenhuma exceção sobrevive depois que a variável some do claro", () => {
    const obsoletas = Object.keys(NAO_SAO_COR).filter((n) => !claro.has(n));
    expect(obsoletas, `exceções obsoletas: ${obsoletas.join(", ")}`).toEqual([]);
  });

  it("a variante dark é por classe, que é o que o script anti-piscada aplica", () => {
    expect(css).toMatch(/@custom-variant dark \(&:is\(\.dark \*\)\)/);
  });
});
