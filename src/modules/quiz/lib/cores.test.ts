import { describe, it, expect } from "vitest";
import { DESIGN_PRESETS, DEFAULT_DESIGN, designAoTrocarDeTema } from "../design-presets";
import { contrasteWCAG, CONTRASTE_BOTAO_MINIMO, CONTRASTE_MINIMO, getContrastText, normalizarCoresDoDesign, normalizarHex, withAlpha } from "./color";
import { getButtonStyle } from "./buttonStyles";

describe("getContrastText", () => {
  it("o rótulo do botão passa de 3:1 (texto grande, WCAG AA) em todos os presets", () => {
    for (const p of [{ name: "Padrão", design: DEFAULT_DESIGN }, ...DESIGN_PRESETS]) {
      const cor = p.design.primary;
      expect(contrasteWCAG(cor, getContrastText(cor)), `${p.name} (${cor})`).toBeGreaterThanOrEqual(CONTRASTE_BOTAO_MINIMO);
    }
  });
  it("laranja, verde e azul usam texto escuro (antes: branco a ~2,7:1)", () => {
    for (const c of ["#f97316", "#10b981", "#0ea5e9"]) expect(getContrastText(c)).toBe("#1a1a1a");
  });
  it("quem já era legível não muda de cara: o roxo do tema padrão segue com texto branco", () => {
    expect(getContrastText("#6366f1")).toBe("#ffffff");
    expect(getContrastText("#111827")).toBe("#ffffff");
  });
  it("valor inválido cai no branco", () => {
    expect(getContrastText("red")).toBe("#ffffff");
  });
});

describe("texto de apoio sobre a superfície dos presets", () => {
  for (const p of [{ name: "Padrão", design: DEFAULT_DESIGN }, ...DESIGN_PRESETS]) {
    it(`${p.name}: muted sobre surface`, () => {
      expect(contrasteWCAG(p.design.muted, p.design.surface)).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
    });
  }
});

describe("hex", () => {
  it("normaliza #rgb e #rrggbb e recusa o resto", () => {
    expect(normalizarHex("#F90")).toBe("#ff9900");
    expect(normalizarHex("ABCDEF")).toBe("#abcdef");
    for (const x of ["red", "#6", "#12g456", "", "#12345", undefined]) expect(normalizarHex(x as never)).toBeNull();
  });
  it("hex de 3 dígitos não quebra o alfa do botão", () => {
    const d = normalizarCoresDoDesign({ ...DEFAULT_DESIGN, primary: "#f90" });
    expect(d.primary).toBe("#ff9900");
    const estilo = getButtonStyle({ ...d, buttonStyle: "gradient" });
    expect(JSON.stringify(estilo.style)).toContain("#ff9900cc");
  });
  it("withAlpha não aceita lixo parcial", () => {
    expect(withAlpha("#12g456", 0.5)).toBe("#12g456");
  });
});

describe("trocar de tema", () => {
  it("título personalizado não sobrevive à troca (evita branco sobre branco)", () => {
    const atual = { ...DEFAULT_DESIGN, titleColor: "#ffffff", logoUrl: "x.png", savedColors: ["#111111"] };
    const r = designAoTrocarDeTema(atual, DESIGN_PRESETS[0].design);
    expect(r.titleColor).toBeUndefined();
    expect(r.logoUrl).toBe("x.png");
    expect(r.savedColors).toEqual(["#111111"]);
    expect(r.primary).toBe(DESIGN_PRESETS[0].design.primary);
  });
  it("restaurar padrão limpa todas as chaves opcionais, menos logo e cores guardadas", () => {
    const atual = { ...DEFAULT_DESIGN, titleColor: "#fff", titleSize: 40, coverImage: true, stickyCta: true, logoUrl: "x.png" };
    const r = designAoTrocarDeTema(atual, DEFAULT_DESIGN, { restaurar: true });
    expect(r.titleSize).toBe(DEFAULT_DESIGN.titleSize);
    expect(r.titleColor).toBeUndefined();
    expect(r.coverImage).toBeUndefined();
    expect(r.stickyCta).toBeUndefined();
    expect(r.logoUrl).toBe("x.png");
  });
});
