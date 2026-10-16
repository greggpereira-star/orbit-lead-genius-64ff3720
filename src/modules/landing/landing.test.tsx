import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPRESA } from "../legal/conteudo";
import * as C from "./conteudo";
import { PaginaInicial } from "./PaginaInicial";

// O roteador não existe em renderização estática: o Link vira um <a>.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...resto }: { children?: unknown; to?: string; [k: string]: unknown }) => (
    <a href={to} {...(resto as object)}>
      {children as never}
    </a>
  ),
}));

const textoDosDados = () =>
  [
    C.HERO.tituloA, C.HERO.tituloB, C.HERO.subtitulo, C.HERO.micro,
    ...C.PROBLEMA.itens.flatMap((i) => [i.titulo, i.texto]),
    C.FLUXO.titulo, C.FLUXO.subtitulo, C.FLUXO.retorno,
    ...C.FLUXO.nos.flatMap((n) => [n.titulo, n.texto]),
    ...C.RECURSOS.flatMap((r) => [r.titulo, r.texto, ...r.pontos]),
    C.WHATSAPP_EM_LIBERACAO.titulo, C.WHATSAPP_EM_LIBERACAO.texto,
    ...C.PARA_QUEM.itens.flatMap((i) => [i.titulo, i.texto]),
    ...C.COMO_COMECA.passos.flatMap((p) => [p.titulo, p.texto]),
    ...C.PERGUNTAS_FREQUENTES.itens.flatMap((p) => [p.pergunta, p.resposta]),
    C.CHAMADA_FINAL.titulo, C.CHAMADA_FINAL.texto,
  ].join("\n");

describe("conteúdo da página inicial", () => {
  it("não traz número de resultado, depoimento nem promessa sem prova", () => {
    const t = textoDosDados();
    expect(t).not.toMatch(/\d+\s*%|\bROI\b|\d+[.,]?\d*\s*(mil|milh|k\b|\+)/i);
    expect(t).not.toMatch(
      /depoimento|cases?\b|empresas? (confiam|atendidas)|clientes? satisfeitos|líder|número 1|garantid|resultado certo/i,
    );
  });

  it("diz que o WhatsApp oficial está em liberação gradual, sem prometer disponibilidade geral", () => {
    expect(C.WHATSAPP_EM_LIBERACAO.selo).toMatch(/liberação gradual/i);
    expect(C.WHATSAPP_EM_LIBERACAO.texto).toMatch(/aos poucos|conforme a análise/i);
    expect(textoDosDados()).not.toMatch(/disponível para todos|conecte agora|em minutos/i);
  });

  it("os preços não são inventados: o texto manda falar com a ALT", () => {
    expect(textoDosDados()).not.toMatch(/R\$\s*\d|por mês|\/mês/i);
    const preco = C.PERGUNTAS_FREQUENTES.itens.find((p) => /custa/i.test(p.pergunta))!;
    expect(preco.resposta).toMatch(/ainda não estão publicados/i);
  });

  it("cada recurso tem tela associada, título e pontos concretos", () => {
    expect(C.RECURSOS).toHaveLength(8);
    for (const r of C.RECURSOS) {
      expect(r.pontos.length).toBeGreaterThanOrEqual(2);
      expect(r.titulo.length).toBeGreaterThan(10);
    }
  });

  it("o rodapé identifica a empresa com os mesmos dados das páginas legais", () => {
    expect(C.RODAPE.empresa).toContain(EMPRESA.razaoSocial);
    expect(C.RODAPE.cnpj).toContain(EMPRESA.cnpj);
    expect(C.RODAPE.links.map((l) => l.para)).toEqual(["/privacy", "/terms", "/data-deletion"]);
  });

  it("os links de contato levam ao WhatsApp da empresa com mensagem pronta", () => {
    expect(C.LINK_FALAR_COM_A_ALT).toMatch(/^https:\/\/wa\.me\/5527999936693\?text=/);
    expect(C.LINK_ENTRAR_NA_FILA).toMatch(/^https:\/\/wa\.me\/5527999936693\?text=/);
  });
});

describe("página inicial (renderizada)", () => {
  const html = renderToStaticMarkup(<PaginaInicial />);

  it("tem um único h1 com a promessa e uma hierarquia de títulos", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Você paga pelo clique.");
    expect(html.match(/<h2/g)!.length).toBeGreaterThanOrEqual(8);
  });

  it("cada item da navegação aponta para uma seção que existe", () => {
    for (const n of C.NAVEGACAO) {
      expect(html).toContain(`href="${n.ancora}"`);
      expect(html).toContain(`id="${n.ancora.slice(1)}"`);
    }
  });

  it("mostra todos os recursos, cada um com a sua tela", () => {
    for (const r of C.RECURSOS) expect(html).toContain(`id="recurso-${r.id}"`);
    // herói + uma tela por recurso, todas avisando que o dado é de exemplo
    expect(html.match(/Tela ilustrativa, com dados de exemplo\./g)!.length).toBe(1 + C.RECURSOS.length);
  });

  it("quem já é cliente entra em um clique e quem é novo fala com a ALT", () => {
    expect(html).toContain('href="/login"');
    expect(html.match(/wa\.me\/5527999936693/g)!.length).toBeGreaterThanOrEqual(3);
    expect(html).toMatch(/target="_blank" rel="noopener noreferrer"/);
  });

  it("as telas de exemplo não usam dado real de cliente nem número de resultado", () => {
    expect(html).not.toMatch(/Sossae|Mavimar|Peticol|Balas Franco|Recanto/i);
    const texto = html.replace(/<[^>]*>/g, " ");
    expect(texto).not.toMatch(/\d+\s*%/);
  });

  it("o FAQ é acessível: botões com aria-expanded e respostas ocultas por padrão", () => {
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(C.PERGUNTAS_FREQUENTES.itens.length);
  });

  it("tem salto para o conteúdo, navegação rotulada e links legais no rodapé", () => {
    expect(html).toContain('aria-label="Seções da página"');
    expect(html).toContain('aria-label="Informações legais"');
    for (const l of C.RODAPE.links) expect(html).toContain(`href="${l.para}"`);
  });

  it("a rota '/' usa a página nova e sai o que a antiga tinha de falso", () => {
    const rota = readFileSync("src/routes/index.tsx", "utf8");
    expect(rota).toContain("component: PaginaInicial");
    expect(rota).not.toMatch(/unsplash|Lovable|2,500|148%|10M\+/i);
  });

  it("os efeitos respeitam movimento reduzido", () => {
    const efeitos = readFileSync("src/modules/landing/efeitos.tsx", "utf8");
    expect(efeitos.match(/useReducedMotion\(\)/g)!.length).toBeGreaterThanOrEqual(4);
    expect(readFileSync("src/modules/landing/Telas.tsx", "utf8")).toContain("useReducedMotion");
    expect(readFileSync("src/modules/landing/Fluxo.tsx", "utf8")).toContain("useReducedMotion");
    expect(readFileSync("src/styles.css", "utf8")).toMatch(/\.landing-faixa/);
  });
});
