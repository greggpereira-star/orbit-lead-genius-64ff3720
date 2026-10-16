import { describe, expect, it } from "vitest";
import {
  envolverSelecao,
  formatarWhatsApp,
  inserirVariavel,
  previaDoTemplate,
  proximaVariavel,
  substituirVariaveis,
} from "./previa";

const resumo = (t: string) =>
  formatarWhatsApp(t).map((x) => `${x.estilos.join("+") || "-"}:${x.texto}`);

describe("formatarWhatsApp", () => {
  it("negrito, itálico, tachado e mono", () => {
    expect(resumo("a *b* _c_ ~d~ ```e```")).toEqual([
      "-:a ",
      "negrito:b",
      "-: ",
      "italico:c",
      "-: ",
      "tachado:d",
      "-: ",
      "mono:e",
    ]);
  });

  it("marcador com espaço colado não formata (igual ao aplicativo)", () => {
    expect(resumo("* nao *")).toEqual(["-:* nao *"]);
    expect(resumo("2 * 3 * 4")).toEqual(["-:2 * 3 * 4"]);
    // Só o espaço DEPOIS de abrir (o fechamento está colado): também é literal.
    expect(resumo("* a*")).toEqual(["-:* a*"]);
    // E só o espaço ANTES de fechar.
    expect(resumo("*a *")).toEqual(["-:*a *"]);
  });

  it("não atravessa quebra de linha e sem fechamento fica literal", () => {
    expect(resumo("*a\nb*")).toEqual(["-:*a\nb*"]);
    expect(resumo("*aberto")).toEqual(["-:*aberto"]);
  });

  it("combina estilos aninhados e não formata dentro do mono", () => {
    expect(resumo("*_x_*")).toEqual(["negrito+italico:x"]);
    expect(resumo("```*x*```")).toEqual(["mono:*x*"]);
  });
});

describe("variáveis", () => {
  it("troca pelo exemplo e deixa {{n}} à vista quando não há", () => {
    expect(substituirVariaveis("Olá {{1}}, pedido {{ 2 }}", ["Ana"])).toBe("Olá Ana, pedido {{2}}");
    expect(substituirVariaveis("{{1}}", ["  "])).toBe("{{1}}");
  });

  it("a próxima variável é o maior número + 1", () => {
    expect(proximaVariavel("sem")).toBe(1);
    expect(proximaVariavel("{{1}} {{2}}")).toBe(3);
    expect(proximaVariavel("{{1}} {{3}}")).toBe(4);
  });

  it("inserir variável respeita o cursor e substitui a seleção", () => {
    expect(inserirVariavel("Olá ", 4, 4)).toEqual({ texto: "Olá {{1}}", cursor: 9 });
    expect(inserirVariavel("Olá XX {{1}}", 4, 6)).toEqual({ texto: "Olá {{2}} {{1}}", cursor: 9 });
  });
});

describe("barra de ferramentas", () => {
  it("envolve a seleção e deixa o cursor sobre ela", () => {
    expect(envolverSelecao("quero agora", 6, 11, "*")).toEqual({
      texto: "quero *agora*",
      cursor: [7, 12],
    });
  });
  it("sem seleção insere o par com o cursor no meio", () => {
    expect(envolverSelecao("oi ", 3, 3, "_")).toEqual({ texto: "oi __", cursor: [4, 4] });
  });
});

describe("previaDoTemplate", () => {
  it("monta cabeçalho, corpo com exemplos, rodapé e botões preenchidos", () => {
    const p = previaDoTemplate({
      nome: "x",
      idioma: "pt_BR",
      categoria: "UTILITY",
      cabecalho: "Pedido {{1}}",
      exemplosDoCabecalho: ["123"],
      corpo: "Olá {{1}}!",
      exemplosDoCorpo: ["Ana"],
      rodape: " Equipe ",
      botoes: [
        { tipo: "URL", texto: "Ver", valor: "https://x" },
        { tipo: "QUICK_REPLY", texto: "  " },
      ],
    });
    expect(p).toEqual({
      cabecalho: "Pedido 123",
      corpo: "Olá Ana!",
      rodape: "Equipe",
      botoes: [{ tipo: "URL", texto: "Ver" }],
    });
  });
});
