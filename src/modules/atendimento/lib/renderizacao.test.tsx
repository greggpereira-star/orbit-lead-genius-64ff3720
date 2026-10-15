import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ListaDeConversas } from "../components/ListaDeConversas";
import type { ConversaDaLista } from "./conversas";

const base: ConversaDaLista = {
  id: "c1",
  status: "open",
  assigned_to: null,
  department_id: null,
  last_message_at: "2026-10-15T15:00:00Z",
  last_message_preview: "Quero um orçamento",
  last_inbound_at: new Date().toISOString(),
  unread_agent: 2,
  lead_id: null,
  origin: null,
  contact: { wa_id: "5527996318075", profile_name: "Ana", opted_out_at: null },
  lead: { id: "l1", name: "Ana Souza", email: null },
};

const props = {
  carregando: false,
  ativaId: null,
  filtro: "todas" as const,
  contagens: { minhas: 0, fila: 1, todas: 1, resolvidas: 0 },
  busca: "",
  onFiltro: () => {},
  onBusca: () => {},
  onAbrir: () => {},
};

describe("ListaDeConversas (renderizada)", () => {
  it("mostra nome do lead, prévia, não lidas e os avisos", () => {
    const html = renderToStaticMarkup(<ListaDeConversas {...props} conversas={[base]} />);
    expect(html).toContain("Ana Souza");
    expect(html).toContain("Quero um orçamento");
    expect(html).toContain("2 não lidas");
    expect(html).toContain("aguardando resposta");
    expect(html).toContain("sem responsável");
  });

  it("opt-out aparece na lista", () => {
    const c = { ...base, contact: { ...base.contact!, opted_out_at: "2026-10-14T00:00:00Z" } };
    expect(renderToStaticMarkup(<ListaDeConversas {...props} conversas={[c]} />)).toContain(
      "pediu para parar",
    );
  });

  it("estado vazio distingue 'sem conversas' de 'busca sem resultado'", () => {
    expect(renderToStaticMarkup(<ListaDeConversas {...props} conversas={[]} />)).toContain(
      "Nenhuma conversa nesta lista",
    );
    expect(
      renderToStaticMarkup(<ListaDeConversas {...props} conversas={[]} busca="xyz" />),
    ).toContain("Nada encontrado");
  });

  it("as quatro abas existem, com contagem, e a ativa está marcada", () => {
    const html = renderToStaticMarkup(<ListaDeConversas {...props} conversas={[base]} />);
    for (const r of ["Minhas", "Fila", "Todas", "Resolvidas"]) expect(html).toContain(r);
    expect(html).toMatch(/aria-selected="true"[^>]*>Todas/);
  });
});

describe("a página /whatsapp", () => {
  const rota = readFileSync("src/routes/_app.whatsapp.tsx", "utf8");
  it("mostra o atendimento só com número oficial; senão a tela legada", () => {
    expect(rota).toContain("const temOficial = (estado.data?.numeros ?? []).length > 0;");
    expect(rota).toContain("<Atendimento companyId={company.id}");
    expect(rota).toContain("return <WhatsAppLegado />;");
  });
});

describe("a conversa (código)", () => {
  const fonte = readFileSync("src/modules/atendimento/components/Conversa.tsx", "utf8");
  it("recusa de envio mantém o texto digitado", () => {
    const i = fonte.indexOf("if (!r.ok) {");
    expect(fonte.slice(i, i + 220)).toContain("return;");
    expect(fonte.slice(i, i + 220)).not.toContain('setTexto("")');
  });
  it("não marca como lida com a aba em segundo plano", () => {
    expect(fonte).toContain('document.visibilityState === "visible"');
  });
  it("rascunho não atravessa conversas", () => {
    expect(fonte).toContain('setTexto("");\n  }, [conversa.id]);');
  });
  it("Enter envia, Shift+Enter quebra linha, IME não envia", () => {
    expect(fonte).toContain('e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing');
  });
});
