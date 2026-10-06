import { describe, it, expect } from "vitest";
import { cliqueAbreOCartao } from "./cliqueDeCartao";

/** Simula um elemento com `closest`. */
const alvo = (dentroDeInterativo = false) => ({
  closest: (_: string) => (dentroDeInterativo ? {} : null),
});

describe("cliqueAbreOCartao", () => {
  it("abre no clique simples numa área vazia do cartão", () => {
    expect(cliqueAbreOCartao({ alvo: alvo() })).toBe(true);
  });

  it("não abre quando o clique nasceu num botão ou link", () => {
    // Clicar em "Excluir" não pode abrir o editor junto.
    expect(cliqueAbreOCartao({ alvo: alvo(true) })).toBe(false);
  });

  it("não abre quando há texto selecionado", () => {
    // Quem arrastou para copiar o nome do quiz solta o mouse sobre o cartão.
    expect(cliqueAbreOCartao({ alvo: alvo(), selecao: "Diagnóstico da" })).toBe(false);
    expect(cliqueAbreOCartao({ alvo: alvo(), selecao: "   " })).toBe(true);
  });

  it("deixa o clique do meio e os atalhos para o navegador", () => {
    expect(cliqueAbreOCartao({ alvo: alvo(), botao: 1 })).toBe(false);
    expect(cliqueAbreOCartao({ alvo: alvo(), ctrl: true })).toBe(false);
    expect(cliqueAbreOCartao({ alvo: alvo(), meta: true })).toBe(false);
    expect(cliqueAbreOCartao({ alvo: alvo(), shift: true })).toBe(false);
  });

  it("não quebra sem alvo", () => {
    expect(cliqueAbreOCartao({ alvo: null })).toBe(false);
  });
});
