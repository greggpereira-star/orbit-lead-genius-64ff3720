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

const textoDaPagina = () =>
  [
    C.HERO.titulo,
    C.HERO.subtitulo,
    C.HERO.nota,
    C.INTRO_PERGUNTAS.titulo,
    ...C.PERGUNTAS.flatMap((p) => [p.pergunta, p.resposta, p.nota]),
    C.WHATSAPP_EM_LIBERACAO.titulo,
    C.WHATSAPP_EM_LIBERACAO.texto,
    ...C.COMO_COMECA.passos.flatMap((p) => [p.titulo, p.texto]),
    C.CHAMADA_FINAL.titulo,
    C.CHAMADA_FINAL.texto,
  ].join("\n");

describe("conteúdo da página inicial", () => {
  it("não traz número de resultado, depoimento nem prova que não temos", () => {
    const t = textoDaPagina();
    // Os números permitidos são só os de regra do canal ("24 horas", "3 h").
    expect(t).not.toMatch(/\d+\s*%|\bROI\b|\d+[.,]?\d*\s*(mil|milh|k\b|\+)/i);
    expect(t).not.toMatch(
      /depoimento|cases?\b|empresas? (confiam|atendidas)|clientes? satisfeitos|líder|número 1|garantid/i,
    );
  });

  it("diz que o WhatsApp oficial está em liberação gradual, sem prometer disponibilidade geral", () => {
    expect(C.WHATSAPP_EM_LIBERACAO.selo).toMatch(/liberação gradual/i);
    expect(C.WHATSAPP_EM_LIBERACAO.texto).toMatch(/aos poucos|conforme a análise/i);
    expect(textoDaPagina()).not.toMatch(/disponível para todos|conecte agora|em minutos/i);
  });

  it("as quatro perguntas existem, numeradas e com resposta e nota", () => {
    expect(C.PERGUNTAS.map((p) => p.numero)).toEqual(["01", "02", "03", "04"]);
    for (const p of C.PERGUNTAS) {
      expect(p.pergunta.endsWith("?")).toBe(true);
      expect(p.resposta.length).toBeGreaterThan(60);
      expect(p.nota.length).toBeGreaterThan(10);
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

  it("tem um único h1, a pergunta do herói, e a ordem de títulos coerente", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("De onde veio esse lead?");
    expect(html.match(/<h3/g)!.length).toBeGreaterThanOrEqual(4 + 3);
  });

  it("cada item da navegação aponta para uma seção que existe", () => {
    for (const n of C.NAVEGACAO) {
      expect(html).toContain(`href="${n.ancora}"`);
      expect(html).toContain(`id="${n.ancora.slice(1)}"`);
    }
  });

  it("quem já é cliente entra em um clique e quem é novo fala com a ALT", () => {
    expect(html).toContain('href="/login"');
    expect(html.match(/wa\.me\/5527999936693/g)!.length).toBeGreaterThanOrEqual(3);
    // link externo abre fora com rel seguro
    expect(html).toMatch(/target="_blank" rel="noreferrer"/);
  });

  it("toda tela de exemplo avisa que os dados são ilustrativos", () => {
    expect(html.match(/dados ilustrativos/g)!.length).toBe(5);
  });

  it("as telas de exemplo não usam dado real de cliente", () => {
    expect(html).not.toMatch(/Sossae|Mavimar|Peticol|Balas Franco|Recanto/i);
  });

  it("tem salto para o conteúdo e rótulos de região para leitor de tela", () => {
    expect(html).toContain('href="#conteudo"');
    expect(html).toContain('aria-label="Seções da página"');
    expect(html).toContain('aria-labelledby="titulo-hero"');
  });

  it("a rota '/' usa a nova página e sai o que a antiga tinha de falso", () => {
    const rota = readFileSync("src/routes/index.tsx", "utf8");
    expect(rota).toContain("component: PaginaInicial");
    expect(rota).not.toMatch(/unsplash|Lovable|2,500|148%|10M\+/i);
  });
});
