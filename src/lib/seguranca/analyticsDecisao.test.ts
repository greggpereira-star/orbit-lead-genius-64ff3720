import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagina = readFileSync("src/routes/_app.analytics.tsx", "utf8");
const anuncios = readFileSync("src/modules/analytics/components/AdIntelligenceCard.tsx", "utf8");
const origem = readFileSync("src/modules/analytics/components/OrigemDosLeadsCard.tsx", "utf8");
const heroi = readFileSync("src/components/ui/numero-heroi.tsx", "utf8");
const sql = readFileSync("supabase/migrations/20261103100000_analytics_decisao.sql", "utf8");

describe("período único na página de Analytics", () => {
  it("o período vem da URL e é validado (lixo cai no padrão)", () => {
    expect(pagina).toContain("Route.useSearch()");
    expect(pagina).toContain("validateSearch");
    expect(pagina).toContain("periodoParaUrl(normalizarPeriodo(busca.dias))");
  });
  it("os cards recebem `dias` e NÃO têm seletor nem estado de período próprios", () => {
    for (const [nome, src] of [
      ["anúncios", anuncios],
      ["origem", origem],
    ] as const) {
      expect(src, nome).toMatch(/dias: string/);
      expect(src, nome).not.toMatch(/const \[dias,/);
      expect(src, nome).not.toContain('aria-label="Período');
    }
    expect(pagina).toContain("<AdIntelligenceCard companyId={companyId} dias={dias} />");
    expect(pagina).toContain("<OrigemDosLeadsCard companyId={companyId} dias={dias} />");
  });
  it("há um único seletor de período na página", () => {
    expect(pagina.match(/<SelectTrigger/g)?.length).toBe(1);
  });
});

describe("erro de consulta não pode parecer 'sem dados'", () => {
  it("a tabela de anúncios mostra erro e só diz 'nenhum lead' quando NÃO houve erro", () => {
    expect(anuncios).toContain("relatorio.isError");
    expect(anuncios).toMatch(
      /!relatorio\.isLoading && !relatorio\.isError && linhas\.length === 0/,
    );
  });
  it("a página trata falha das consultas de resumo e origem, e do funil", () => {
    expect(pagina).toContain("resumo.isError || origem.isError");
    expect(pagina).toContain("erro={funil.isError}");
  });
  it("a idade média da etapa não é atribuída aos leads parados (são médias diferentes)", () => {
    const f = readFileSync("src/modules/analytics/components/FunilDoPeriodo.tsx", "utf8");
    expect(f).not.toContain("em média há {media} na etapa");
    expect(f).toContain("os leads estão há {media} em média");
  });
  it("o aviso de gasto não espreme o texto numa coluna de 60 px no celular", () => {
    const g = readFileSync("src/modules/analytics/components/GastoDoAnuncio.tsx", "utf8");
    expect(g).toContain('className="min-w-[12rem] flex-1 text-muted-foreground"');
  });
  it("o aviso de erro é anunciado (role=alert) e diz que a consulta falhou", () => {
    const e = readFileSync("src/modules/analytics/components/ErroDeConsulta.tsx", "utf8");
    expect(e).toContain('role="alert"');
    expect(e).toContain("A consulta falhou");
  });
});

describe("textos e números que não enganam", () => {
  it("'Conversas' virou 'Leads' (são leads de formulário de anúncio)", () => {
    expect(anuncios).not.toMatch(/Conversas/);
    expect(anuncios).toMatch(/cabecalho\(["']leads["'], ["']Leads["']\)/);
  });
  it("ROAS é de VENDAS, e o valor de lead qualificado se chama o que é", () => {
    expect(anuncios).toContain("ROAS (vendas ÷ gasto)");
    expect(anuncios).toContain("Não é receita");
    expect(anuncios).toMatch(/>\s*Pipeline\s*</);
    expect(anuncios).not.toContain("Retorno (ROAS)");
  });
  it("a tile de valor mostra vendas GANHAS, separadas do que está em negociação", () => {
    expect(pagina).toContain("Vendas ganhas");
    expect(pagina).toContain("em negociação");
    expect(pagina).not.toContain("Valor em negócios");
  });
  it("saiu a nota interna do desenvolvedor; entrou o horário de atualização", () => {
    expect(pagina).not.toContain("Nada aqui é exemplo");
    expect(pagina).toContain("Atualizado às");
  });
  it("número em dinheiro não é cortado em silêncio: título com o valor inteiro e fonte menor", () => {
    expect(heroi).toContain("title={texto}");
    expect(heroi).toMatch(/longo/);
  });
});

describe("banco: ROAS e gasto", () => {
  it("o ROAS usa o valor de etapas do tipo 'won', não o de leads qualificados", () => {
    expect(sql).toContain("st.kind = 'won'");
    expect(sql).toMatch(
      /CASE WHEN u\.gasto > 0 AND coalesce\(wa\.valor, 0\) > 0\s+THEN round\(wa\.valor \/ u\.gasto, 2\)/,
    );
    expect(sql).not.toMatch(/round\(r\.valor_total \/ /);
  });
  it("o gasto de cada anúncio entra UMA vez (só na primeira linha do anúncio)", () => {
    expect(sql).toContain("row_number() OVER (PARTITION BY r.ad_id");
    expect(sql).toContain("LEFT JOIN gasto g ON g.ad_id = r.ad_id AND r.rn = 1");
  });
  it("a venda é juntada no MESMO grão do relatório (anúncio + nome + campanha + rede)", () => {
    expect(sql).toMatch(
      /w\.ad_id = u\.ad_id AND w\.ad_name = u\.ad_name AND w\.campanha = u\.campanha AND w\.rede = u\.rede/,
    );
  });
  it("anúncio que gastou e não trouxe lead continua aparecendo", () => {
    expect(sql).toContain("WHERE NOT EXISTS (SELECT 1 FROM rel r WHERE r.ad_id = g.ad_id)");
  });
  it("lead parado só conta em etapa aberta e as funções conferem o acesso à empresa", () => {
    expect(sql).toMatch(/WHERE s\.kind = 'open'\s+AND coalesce\(l\.stage_entered_at/);
    expect((sql.match(/exigir_acesso_a_empresa\(p_company_id\)/g) ?? []).length).toBe(2);
  });
});
