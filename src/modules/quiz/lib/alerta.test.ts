import { describe, it, expect } from "vitest";
import { estiloDoAlerta, VARIANTES_DE_ALERTA } from "./alerta";

const temaClaro = { primary: "#2563EB", muted: "#64748B", text: "#0F172A" };
const temaEscuro = { primary: "#A78BFA", muted: "#94A3B8", text: "#F8FAFC" };

describe("estiloDoAlerta", () => {
  it("sem variante, cai em informação", () => {
    expect(estiloDoAlerta(undefined, temaClaro)).toEqual(estiloDoAlerta("info", temaClaro));
  });

  it("o texto segue o TEMA e não o matiz da variante", () => {
    // Um alerta vermelho escrito em vermelho vira mancha nos temas escuros, e o
    // tema é escolhido depois que o texto já foi escrito.
    expect(estiloDoAlerta("erro", temaClaro).texto).toBe("#0F172A");
    expect(estiloDoAlerta("erro", temaEscuro).texto).toBe("#F8FAFC");
  });

  it("as quatro variantes de significado têm matizes distintos", () => {
    const fixas = ["info", "sucesso", "atencao", "erro"] as const;
    const destaques = fixas.map((v) => estiloDoAlerta(v, temaClaro).destaque);
    expect(new Set(destaques).size).toBe(fixas.length);
  });

  it('"cor do tema" pode coincidir com uma variante fixa — e tudo bem', () => {
    // Num quiz cujo primário é o mesmo azul do "info", as duas ficam iguais.
    // Não é defeito: quem escolheu o tema foi o autor.
    const azul = { ...temaClaro, primary: "#2563EB" };
    expect(estiloDoAlerta("tema", azul).destaque).toBe(estiloDoAlerta("info", azul).destaque);
  });

  it('"cor do tema" usa a primária do quiz', () => {
    expect(estiloDoAlerta("tema", temaEscuro).destaque).toBe("#A78BFA");
  });

  it('"neutro" usa a cor secundária do quiz', () => {
    expect(estiloDoAlerta("neutro", temaClaro).destaque).toBe("#64748B");
  });

  it("fundo e borda são o mesmo matiz em transparências diferentes", () => {
    const e = estiloDoAlerta("sucesso", temaClaro);
    expect(e.fundo).toContain("/ 0.12");
    expect(e.borda).toContain("/ 0.35");
    expect(e.fundo.replace(/ \/ .*/, "")).toBe(e.borda.replace(/ \/ .*/, ""));
  });

  it("não devolve cor vazia em nenhuma variante", () => {
    for (const v of VARIANTES_DE_ALERTA) {
      const e = estiloDoAlerta(v.valor, temaClaro);
      for (const [chave, valor] of Object.entries(e)) {
        expect(valor, `${v.valor}.${chave}`).toBeTruthy();
      }
    }
  });
});
