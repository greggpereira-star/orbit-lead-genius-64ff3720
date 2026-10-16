import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { ListaDeConversas } from "../components/ListaDeConversas";
import type { ConversaDaLista } from "./conversas";

// O roteador não existe em renderização estática: o Link vira um <a>.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: unknown; to?: string }) => (
    <a href={to}>{children as never}</a>
  ),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (f: unknown) => f }));
vi.mock("@/lib/whatsapp-atendimento.functions", () => ({ criarNotaWhatsApp: async () => ({}) }));

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
  contagens: { entrada: 1, minhas: 0, fila: 1, todas: 1, resolvidas: 0 },
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
    // O bloco da recusa vai até o `return;`: nada antes dele pode limpar o campo.
    const i = fonte.indexOf("if (!r.ok) {");
    const fim = fonte.indexOf("return;", i);
    expect(i).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(i);
    expect(fonte.slice(i, fim)).not.toContain('setTexto("")');
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

describe("ConectarPrimeiro", () => {
  it("a entrada é conectar pela Meta; a Evolution fica como opção secundária", async () => {
    const { ConectarPrimeiro } = await import("../components/ConectarPrimeiro");
    const html = renderToStaticMarkup(<ConectarPrimeiro onVerLegado={() => {}} />);
    expect(html).toContain("Conectar número do WhatsApp Business");
    expect(html).toContain("Usar a conexão antiga (QR code)");
    expect(html.indexOf("Conectar número")).toBeLessThan(html.indexOf("conexão antiga"));
  });
});

describe("VisoesDoInbox", () => {
  it("lista as visões com a contagem e marca a ativa", async () => {
    const { VisoesDoInbox } = await import("../components/VisoesDoInbox");
    const html = renderToStaticMarkup(
      <VisoesDoInbox
        filtro="minhas"
        contagens={{ entrada: 7, minhas: 3, fila: 2, todas: 9, resolvidas: 2 }}
        onFiltro={() => {}}
      />,
    );
    for (const t of ["Entrada", "Minhas", "Não atribuídas", "Resolvidas"])
      expect(html).toContain(t);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });
});

describe("PainelDoLead (renderizado)", () => {
  async function painel(c: ConversaDaLista) {
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const { PainelDoLead } = await import("../components/PainelDoLead");
    const qc = new QueryClient();
    return renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <PainelDoLead conversa={c} />
      </QueryClientProvider>,
    );
  }

  it("cartão do contato com ações rápidas e seções do CRM", async () => {
    const html = await painel(base);
    expect(html).toContain("Ana Souza");
    expect(html).toContain("tel:+5527996318075");
    expect(html).toContain("https://wa.me/5527996318075");
    for (const s of ["Contato", "Negociação", "Notas"]) expect(html).toContain(s);
    expect(html).toContain('aria-expanded="true"');
  });

  it("contato sem lead explica o vínculo em vez de mostrar campos vazios", async () => {
    const html = await painel({ ...base, lead_id: null, lead: null });
    expect(html).toContain("ainda não está ligado a um lead");
    expect(html).not.toContain("Temperatura");
  });

  it("opt-out aparece no topo do painel", async () => {
    const c = { ...base, contact: { ...base.contact!, opted_out_at: "2026-10-14T00:00:00Z" } };
    expect(await painel(c)).toContain("Pediu para não receber mensagens");
  });
});

describe("MenuDaConversa", () => {
  async function menu(c: ConversaDaLista) {
    const { MenuDaConversa } = await import("../components/MenuDaConversa");
    return renderToStaticMarkup(
      <MenuDaConversa
        conversa={c}
        onNaoLida={() => {}}
        onPendente={() => {}}
        onPesquisar={() => {}}
        onInformacoes={() => {}}
        onCopiarNumero={() => {}}
      />,
    );
  }

  it("fechado: só o gatilho acessível (os itens abrem sob demanda)", async () => {
    const html = await menu(base);
    expect(html).toContain("Mais ações da conversa");
  });

  it("o conteúdo do menu cobre as ações combinadas", () => {
    const fonte = readFileSync("src/modules/atendimento/components/MenuDaConversa.tsx", "utf8");
    for (const t of [
      "Marcar como não lida",
      "Marcar como pendente",
      "Desmarcar como pendente",
      "Pesquisar na conversa",
      "Copiar número",
      "Abrir lead no CRM",
    ])
      expect(fonte).toContain(t);
    // Conversa resolvida não oferece "pendente".
    expect(fonte).toContain("{!resolvida && (");
  });
});
