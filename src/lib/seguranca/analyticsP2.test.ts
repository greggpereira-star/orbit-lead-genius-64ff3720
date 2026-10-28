import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ler = (p: string) => readFileSync(p, "utf8");
const card = ler("src/components/ui/card.tsx");
const anuncios = ler("src/modules/analytics/components/AdIntelligenceCard.tsx");
const origem = ler("src/modules/analytics/components/OrigemDosLeadsCard.tsx");
const gasto = ler("src/modules/analytics/components/GastoDoAnuncio.tsx");
const erro = ler("src/modules/analytics/components/ErroDeConsulta.tsx");
const pagina = ler("src/routes/_app.analytics.tsx");
const heroi = ler("src/components/ui/numero-heroi.tsx");
const sqlOrigem = ler("supabase/migrations/20261102200000_origem_por_mensagem.sql");

describe("estrutura e leitor de tela", () => {
  it("o título do card pode ser cabeçalho, e os cards da página usam h2", () => {
    expect(card).toMatch(/as\?: "div" \| "h2" \| "h3"/);
    expect(anuncios).toContain('<CardTitle as="h2"');
    expect(origem).toContain('<CardTitle as="h2"');
  });
  it("a tabela de anúncios tem legenda, cabeçalhos de coluna e de linha, e informa a ordenação", () => {
    expect(anuncios).toContain('<caption className="sr-only">');
    expect(anuncios).toContain('scope="col"');
    expect(anuncios).toContain('scope="row"');
    expect(anuncios).toContain("aria-sort=");
  });
  it("a ordenação é por botão (teclado), não por clique em célula", () => {
    expect(anuncios).toMatch(/<button\s+type="button"\s+onClick=\{\(\) => setOrdem\(alternarOrdem/);
  });
  it("o cabeçalho ordenável NÃO é componente declarado dentro do render (remontaria e perderia o foco do teclado)", () => {
    expect(anuncios).not.toMatch(/const Cabecalho\s*=/);
    expect(anuncios).not.toContain("<Cabecalho");
    expect(anuncios).toContain("const cabecalho = (coluna: ColunaOrdenavel");
  });
  it("ícones decorativos ficam fora da árvore de acessibilidade", () => {
    expect(anuncios).toContain("aria-hidden");
    expect(erro).toContain("aria-hidden");
  });
});

describe("tabela de anúncios ajuda a ler, sem decidir", () => {
  it("mostra 'Amostra pequena' com a explicação de regra prática, e 'Gastou e não trouxe lead'", () => {
    expect(anuncios).toContain("Amostra pequena");
    expect(anuncios).toContain("regra prática, não uma garantia");
    expect(anuncios).toContain("Gastou e não trouxe lead");
  });
  it("tem linha de total e explica por que o custo do total não é a média das linhas", () => {
    expect(anuncios).toContain("<tfoot>");
    expect(anuncios).toContain("não é a média das linhas");
  });
  it("a primeira coluna fica fixa quando a tabela rola no celular", () => {
    expect(anuncios).toContain("sticky left-0");
  });
});

describe("toque, texto e tema", () => {
  it("controles do conteúdo têm 44 px no celular e o tamanho compacto só a partir de md", () => {
    for (const [nome, src] of [
      ["origem", origem],
      ["gasto", gasto],
      ["erro", erro],
      ["página", pagina],
    ] as const) {
      expect(src, nome).toContain("h-11");
      expect(src, nome).toMatch(/md:h-(8|9)/);
    }
    expect(anuncios).toContain("min-h-11");
  });
  it("o link do aviso do funil também tem 44 px de altura no celular", () => {
    expect(ler("src/modules/analytics/components/FunilDoPeriodo.tsx")).toContain(
      "inline-flex min-h-11 items-center",
    );
  });
  it("rótulo e nota das tiles têm 12 px (antes 11 px)", () => {
    expect(heroi).not.toContain("text-[11px]");
  });
  it("o card de origem não usa cor fixa do Tailwind: usa o token de aviso", () => {
    expect(origem).not.toMatch(/amber-\d/);
    expect(origem).toContain("var(--aviso)");
  });
});

describe("lista de não rastreados", () => {
  it("cresce de 50 em 50 e o teto da tela é o mesmo da função do banco (200)", () => {
    expect(origem).toContain("const LIMITE_INICIAL = 50;");
    expect(origem).toContain("const LIMITE_MAXIMO = 200;");
    expect(sqlOrigem).toContain("least(p_limite, 200)");
    expect(origem).toContain("Mostrar mais");
  });
  it("diz quantos aparecem de quantos existem", () => {
    expect(origem).toMatch(/Mostrando \{orfaos\.data\?\.length\} de \{resumo\.naoRastreados\}/);
  });
});
