import { describe, expect, it } from "vitest";
import {
  corpoDe,
  exemplosDoCorpo,
  previaDeAprovado,
  resumoDoCorpo,
  rotuloDaCategoria,
  totalDeVariaveis,
  variaveisSemValor,
} from "./templatesAprovados";

const t = (components: Array<Record<string, unknown>>, category = "UTILITY") => ({
  name: "confirmacao_visita",
  language: "pt_BR",
  category,
  components,
});
const completo = t([
  { type: "HEADER", format: "TEXT", text: "Visita confirmada" },
  {
    type: "BODY",
    text: "Olá {{1}}, sua visita está confirmada para {{2}}.",
    example: { body_text: [["Marina", "sábado às 10h"]] },
  },
  { type: "FOOTER", text: "Equipe Leadflow" },
  {
    type: "BUTTONS",
    buttons: [
      { type: "QUICK_REPLY", text: "Confirmar" },
      { type: "URL", text: "Ver endereço" },
    ],
  },
]);

describe("templates aprovados na conversa", () => {
  it("lê o corpo e conta as variáveis distintas (repetida conta uma vez)", () => {
    expect(corpoDe(completo)).toMatch(/^Olá \{\{1\}\}/);
    expect(totalDeVariaveis(completo)).toBe(2);
    expect(totalDeVariaveis(t([{ type: "BODY", text: "{{1}} e de novo {{1}}" }]))).toBe(1);
    expect(totalDeVariaveis(t([{ type: "BODY", text: "Sem variável" }]))).toBe(0);
    expect(corpoDe(t([]))).toBe("");
  });
  it("usa os exemplos dados à Meta como dica do campo", () => {
    expect(exemplosDoCorpo(completo)).toEqual(["Marina", "sábado às 10h"]);
    expect(exemplosDoCorpo(t([{ type: "BODY", text: "x" }]))).toEqual([]);
    expect(
      exemplosDoCorpo(t([{ type: "BODY", text: "x", example: { body_text: "quebrado" } }])),
    ).toEqual([]);
  });
  it("o resumo da lista é uma linha, sem chaves de variável e com corte", () => {
    expect(resumoDoCorpo(completo)).toBe("Olá …, sua visita está confirmada para ….");
    const longo = t([{ type: "BODY", text: "palavra ".repeat(60) }]);
    const r = resumoDoCorpo(longo, 40);
    expect(r.length).toBe(40);
    expect(r.endsWith("…")).toBe(true);
    expect(resumoDoCorpo(t([{ type: "BODY", text: "linha 1\n\nlinha 2" }]))).toBe(
      "linha 1 linha 2",
    );
  });
  it("a prévia usa o que foi digitado e mantém {{n}} à vista onde falta valor", () => {
    expect(previaDeAprovado(completo, { 1: "Ana" }).corpo).toBe(
      "Olá Ana, sua visita está confirmada para {{2}}.",
    );
    expect(previaDeAprovado(completo, { 1: "Ana", 2: "domingo" }).corpo).toBe(
      "Olá Ana, sua visita está confirmada para domingo.",
    );
  });
  it("a prévia traz cabeçalho de texto, rodapé e botões; cabeçalho de mídia não aparece", () => {
    const p = previaDeAprovado(completo, {});
    expect(p.cabecalho).toBe("Visita confirmada");
    expect(p.rodape).toBe("Equipe Leadflow");
    expect(p.botoes.map((b) => b.texto)).toEqual(["Confirmar", "Ver endereço"]);
    const midia = t([
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "oi" },
    ]);
    expect(previaDeAprovado(midia, {}).cabecalho).toBeNull();
  });
  it("categoria em português, e categoria desconhecida não quebra", () => {
    expect(rotuloDaCategoria("UTILITY")).toBe("Utilidade");
    expect(rotuloDaCategoria("marketing")).toBe("Marketing");
    expect(rotuloDaCategoria("NOVA_COISA")).toBe("nova_coisa");
  });
  it("aponta quais variáveis faltam (espaço em branco não conta como valor)", () => {
    expect(variaveisSemValor(2, { 1: "Ana" })).toEqual([2]);
    expect(variaveisSemValor(2, { 1: "Ana", 2: "   " })).toEqual([2]);
    expect(variaveisSemValor(2, { 1: "a", 2: "b" })).toEqual([]);
    expect(variaveisSemValor(0, {})).toEqual([]);
  });
});
