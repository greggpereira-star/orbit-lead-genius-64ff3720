import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * No menu recolhido só o ícone identifica o item. Dois itens com o mesmo ícone
 * (aconteceu com "Chat ao vivo" e "WhatsApp") são indistinguíveis.
 */
describe("ícones do menu lateral", () => {
  const fonte = readFileSync("src/design-system/components/AppSidebar.tsx", "utf8");
  const itens = [...fonte.matchAll(/\{\s*title:\s*'([^']+)',\s*icon:\s*(\w+)/g)].map((m) => ({ titulo: m[1], icone: m[2] }));

  it("encontra os itens do menu", () => {
    expect(itens.length).toBeGreaterThanOrEqual(10);
  });
  it("cada item tem um ícone próprio", () => {
    const repetidos = itens.filter((a, i) => itens.findIndex((b) => b.icone === a.icone) !== i);
    expect(repetidos).toEqual([]);
  });
  it("WhatsApp e Chat ao vivo se distinguem de relance", () => {
    const por = Object.fromEntries(itens.map((i) => [i.titulo, i.icone]));
    expect(por["WhatsApp"]).toBe("WhatsAppIcon");
    expect(por["Chat ao vivo"]).not.toBe(por["WhatsApp"]);
  });
});

describe("menu recolhido: botão, borda e cabeçalho", () => {
  const fonte = readFileSync("src/design-system/components/AppSidebar.tsx", "utf8");
  const topbar = readFileSync("src/design-system/components/Topbar.tsx", "utf8");

  it("a alça de reduzir/ampliar fica na borda do menu, com nome acessível, estado e o atalho na dica", () => {
    expect(fonte).toContain("function AlcaDoMenu(");
    expect(fonte).toContain("onClick={onAlternar}");
    expect(fonte).toContain("<AlcaDoMenu recolhido={recolhido} onAlternar={toggleSidebar} />");
    expect(fonte).toMatch(/aria-label=\{recolhido \? 'Ampliar menu' : 'Reduzir menu'\}/);
    expect(fonte).toContain("aria-expanded={!recolhido}");
    expect(fonte).toContain("Ctrl+B");
    // Meio da borda direita, metade para fora do menu.
    expect(fonte).toContain("absolute right-0 top-1/2");
    expect(fonte).toContain("-translate-y-1/2 translate-x-1/2");
  });
  it("não sobra a linha 'Reduzir menu' no rodapé (era item de navegação falso)", () => {
    expect(fonte).not.toContain("<span className=\"flex-1\">Reduzir menu</span>");
  });
  it("o bloco do usuário tem altura para as duas linhas (antes 'Ver configurações' era cortada)", () => {
    const rodape = fonte.slice(fonte.indexOf("<SidebarFooter"));
    expect(rodape).toContain('size="lg"');
    expect(rodape).toContain("pb-3");
  });
  it("a borda do menu também alterna (SidebarRail), em vez de ficar sem uso", () => {
    expect(fonte).toContain("<SidebarRail />");
  });
  it("recolhido, o botão da empresa é um quadrado de 32 px (a caixa de 36 px transbordava do menu)", () => {
    expect(fonte).toContain("group-data-[collapsible=icon]:!size-8");
    expect(fonte).toContain("group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8");
  });
  it("o botão da empresa tem nome acessível mesmo com o texto escondido", () => {
    expect(fonte).toContain("aria-label={`Empresa ${company?.name || 'Workspace'}`}");
  });
  it("a alça não aparece no celular (lá o menu é uma gaveta)", () => {
    expect(fonte).toContain("{!isMobile && <AlcaDoMenu");
  });
  it("no celular a barra superior tem o botão que abre a gaveta (antes nada a abria)", () => {
    expect(topbar).toContain("isMobile && (");
    expect(topbar).toContain('aria-label="Abrir menu"');
    expect(topbar).toContain("onClick={toggleSidebar}");
  });
});
