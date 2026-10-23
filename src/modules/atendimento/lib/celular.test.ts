import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ler = (p: string) => readFileSync(p, "utf8");

/**
 * Auditoria no celular (390 px, 24/10/2026): alvos de toque de 22–32 px, placeholder cortado e
 * ações de etapa/etiqueta a dois toques. Estes testes seguram as correções; não medem layout.
 */
describe("celular: alvos de toque", () => {
  it("etapa, ganho/perdido e etiquetas passam de 40 px em tela estreita", () => {
    const etapa = ler("src/modules/crm/components/EtapaDoLead.tsx");
    expect(etapa).toContain("max-sm:min-h-10");
    expect(etapa).toContain("max-sm:min-h-11");
    const etiquetas = ler("src/modules/crm/components/EtiquetasDoLead.tsx");
    expect(etiquetas).toContain("max-sm:min-h-10");
    expect(etiquetas).toContain("max-sm:h-11");
  });

  it("filtros e ordenação da lista crescem no celular", () => {
    const lista = ler("src/modules/atendimento/components/ListaDeConversas.tsx");
    expect(lista).toContain("max-sm:h-11");
    expect(lista).toContain("max-sm:h-10");
    expect(lista).toContain("max-sm:py-3");
  });

  it("o botão de fechar do painel tem área de toque maior que o ícone", () => {
    expect(ler("src/components/ui/sheet.tsx")).toContain("-m-3 rounded-sm p-3");
  });
});

describe("celular: texto e atalhos", () => {
  it("o placeholder da resposta é curto no celular", () => {
    const c = ler("src/modules/atendimento/components/Conversa.tsx");
    expect(c).toContain('useMediaQuery("(max-width: 639px)")');
    expect(c).toContain('celular ? "Responder…"');
  });

  it("a busca do topo está em português e não quebra linha", () => {
    const t = ler("src/design-system/components/Topbar.tsx");
    expect(t).toContain("Buscar ou ir para");
    expect(t).not.toContain("Search or jump to");
    expect(t).toContain("whitespace-nowrap");
  });

  it("a conversa mostra etapa e etiquetas à vista quando não há coluna do contato", () => {
    const a = ler("src/modules/atendimento/components/Atendimento.tsx");
    expect(a).toContain("!painelInline && ativa.lead");
    expect(a).toContain("Abrir etapa e etiquetas do contato");
  });

  it("o título da regra quebra linha no celular em vez de ser cortado", () => {
    const p = ler("src/modules/automation/components/PainelDeAutomacao.tsx");
    expect(p).toContain("max-sm:break-words sm:truncate");
  });

  it("Mencionar e Salvar nota passam de 40 px, e o interruptor ganha área de toque invisível", () => {
    const painel = ler("src/modules/atendimento/components/PainelDoLead.tsx");
    expect(painel).toContain('className="h-9 px-4 max-sm:h-11"');
    expect(painel).toContain('className="h-9 gap-1.5 px-3 max-sm:h-11"');
    // O desenho do interruptor não muda: a área extra é um pseudo-elemento transparente.
    expect(ler("src/components/ui/switch.tsx")).toContain("max-sm:after:-inset-y-3");
  });
});
