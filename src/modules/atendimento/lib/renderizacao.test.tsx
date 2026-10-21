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
vi.mock("@/lib/whatsapp-cloud.functions", () => ({
  conectarNumeroManualWhatsApp: async () => ({}),
}));
vi.mock("@/lib/whatsapp-atendimento.functions", () => ({
  criarNotaWhatsApp: async () => ({}),
  listarAtendentesWhatsApp: async () => [],
  criarLeadDaConversaWhatsApp: async () => ({}),
  vincularConversaAoLeadWhatsApp: async () => ({}),
}));

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
  contagens: { entrada: 1, minhas: 0, seguindo: 0, mencoes: 0, fila: 1, todas: 1, resolvidas: 0 },
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
    // O cliente espera: a linha mostra HÁ QUANTO TEMPO, não só a data.
    expect(html).toMatch(/Aguardando resposta há (agora|\d+ min|\d+ h)/);
    // "sem responsável" em toda linha era ruído: a Fila já mostra quem ninguém pegou.
    expect(html).not.toContain("sem responsável");
  });

  it("mostra o responsável pelas iniciais, só quando existe", () => {
    const c = { ...base, assigned_to: "u1" };
    const html = renderToStaticMarkup(
      <ListaDeConversas {...props} conversas={[c]} atendentes={{ u1: "Aline Atendente" }} />,
    );
    expect(html).toContain("Responsável: Aline Atendente");
    expect(renderToStaticMarkup(<ListaDeConversas {...props} conversas={[base]} />)).not.toContain(
      "Responsável:",
    );
  });

  it("as sete visões ficam todas visíveis: sem rolagem escondida que corte 'Menções'", () => {
    const html = renderToStaticMarkup(<ListaDeConversas {...props} conversas={[base]} />);
    expect(html).toContain('aria-label="Filtrar conversas"');
    expect(html).not.toContain("xl:hidden");
    // Antes era uma fila com `overflow-x-auto` sem barra: a última aba saía cortada.
    expect(html).not.toContain("overflow-x-auto");
    for (const rotulo of [
      "Entrada",
      "Minhas",
      "Seguindo",
      "Menções",
      "Fila",
      "Todas",
      "Resolvidas",
    ])
      expect(html).toContain(rotulo);
    expect(html.match(/role="tab"/g)).toHaveLength(7);
  });

  it("contato sem lead: o painel oferece criar/ligar, e só atendente pode (visualizador vê travado)", () => {
    const painel = readFileSync("src/modules/atendimento/components/PainelDoLead.tsx", "utf8");
    expect(painel).toContain("function CriarLeadDaConversa");
    expect(painel).toContain(
      "<CriarLeadDaConversa conversa={conversa} somenteLeitura={somenteLeitura} />",
    );
    expect(painel).toContain("criarLeadDaConversaWhatsApp");
    expect(painel).toContain("vincularConversaAoLeadWhatsApp");
    expect(painel).toContain("Peça a um atendente ou administrador");

    const fns = readFileSync("src/lib/whatsapp-atendimento.functions.ts", "utf8");
    for (const nome of ["criarLeadDaConversaWhatsApp", "vincularConversaAoLeadWhatsApp"]) {
      const i = fns.indexOf(`export const ${nome}`);
      expect(i).toBeGreaterThan(-1);
      // a empresa vem da SESSÃO (atendente ou acima), nunca do navegador
      expect(fns.slice(i, i + 900)).toContain("empresaParaAtender(admin, context.userId)");
    }
  });

  it("a menção de colega é uma lista própria, não o <select> nativo que cortava", () => {
    const painel = readFileSync("src/modules/atendimento/components/PainelDoLead.tsx", "utf8");
    expect(painel).toContain("function MencionarColega");
    expect(painel).not.toContain("<select");
    expect(painel).toContain('aria-label="Mencionar colega"');
  });

  it("a ordenação só aparece quando a tela a oferece, e marca a escolhida", () => {
    expect(renderToStaticMarkup(<ListaDeConversas {...props} conversas={[base]} />)).not.toContain(
      "Maior espera",
    );
    const html = renderToStaticMarkup(
      <ListaDeConversas {...props} conversas={[base]} ordem="espera" onOrdem={() => {}} />,
    );
    expect(html).toContain("Recentes");
    expect(html).toContain("Maior espera");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  it("o topo da coluna é de quem monta a tela (título, tela cheia…)", () => {
    const html = renderToStaticMarkup(
      <ListaDeConversas {...props} conversas={[]} topo={<h1>Topo de teste</h1>} />,
    );
    expect(html.indexOf("Topo de teste")).toBeLessThan(html.indexOf("Buscar conversas"));
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

  it("contato sem lead oferece criar o lead em vez de mostrar campos vazios", async () => {
    const html = await painel({ ...base, lead_id: null, lead: null });
    expect(html).toContain("ainda não é um lead");
    expect(html).toContain("Criar lead");
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

describe("nota com menção", () => {
  it("o painel oferece mencionar colega e envia os ids ao servidor", () => {
    const painel = readFileSync("src/modules/atendimento/components/PainelDoLead.tsx", "utf8");
    expect(painel).toContain('aria-label="Mencionar colega"');
    expect(painel).toContain("...(mencionar.length ? { mencionar } : {})");
  });
});

describe("PreviaDoTemplate", () => {
  it("aplica negrito/itálico e mostra os botões como o cliente verá", async () => {
    const { PreviaDoTemplate } = await import("../components/PreviaDoTemplate");
    const html = renderToStaticMarkup(
      <PreviaDoTemplate
        previa={{
          cabecalho: "Pedido 1",
          corpo: "Olá *Ana*, _obrigado_",
          rodape: "Equipe",
          botoes: [{ tipo: "URL", texto: "Ver pedido" }],
        }}
      />,
    );
    expect(html).toContain("font-bold");
    expect(html).toContain("italic");
    expect(html).toContain("Ver pedido");
    expect(html).toContain("Equipe");
  });

  it("vazio mostra a dica em vez de uma bolha em branco", async () => {
    const { PreviaDoTemplate } = await import("../components/PreviaDoTemplate");
    const html = renderToStaticMarkup(
      <PreviaDoTemplate previa={{ cabecalho: null, corpo: "", rodape: null, botoes: [] }} />,
    );
    expect(html).toContain("A mensagem aparece aqui");
  });
});

describe("editor de template (código)", () => {
  const fonte = readFileSync("src/routes/_app.settings.whatsapp.tsx", "utf8");
  it("usa a MESMA validação do servidor e mostra a pré-visualização", () => {
    expect(fonte).toContain("validarTemplate(def)");
    expect(fonte).toContain("<PreviaDoTemplate previa={previaDoTemplate(def)} />");
  });
});

describe("conexão manual", () => {
  it("o token é campo de senha e o formulário só valida IDs numéricos", async () => {
    const { ehIdDaMeta } = await import("../components/ConexaoManual");
    expect(ehIdDaMeta("1357165290819369")).toBe(true);
    expect(ehIdDaMeta(" 1712518090288635 ")).toBe(true);
    for (const v of ["", "abc", "123", "12 34 56", "1357165290819369x"])
      expect(ehIdDaMeta(v)).toBe(false);
    const fonte = readFileSync("src/modules/atendimento/components/ConexaoManual.tsx", "utf8");
    expect(fonte).toContain('type="password"');
    expect(fonte).toContain('setToken("")');
  });

  it("o servidor exige administrador e não devolve nem registra o token", () => {
    const s = readFileSync("src/lib/whatsapp-cloud.functions.ts", "utf8");
    const i = s.indexOf("export const conectarNumeroManualWhatsApp");
    const f = s.slice(i, s.indexOf("\nexport const ", i + 10));
    expect(f).toContain("empresaParaAdministrar(admin, context.userId)");
    expect(f).not.toContain("console.");
    expect(f).not.toMatch(/return[^;]*data\.token/);
  });
});

describe("conexão manual com número já conectado", () => {
  it("a configuração oferece a conexão manual também quando já há número (antes sumia)", () => {
    const fonte = readFileSync("src/routes/_app.settings.whatsapp.tsx", "utf8");
    expect(fonte).toMatch(/numeros\.length > 0 && <ConexaoManual/);
    // E o caminho de quando não há número continua.
    expect(fonte).toMatch(/numeros\.length === 0 &&/);
  });
});

describe("SeletorDeResponsavel", () => {
  const atendentes = [
    { id: "u1", nome: "Aline Atendente" },
    { id: "u2", nome: "Bruno Vendas" },
  ];
  async function ver(valor: string | null, extra: Record<string, unknown> = {}) {
    const { SeletorDeResponsavel } = await import("../components/SeletorDeResponsavel");
    return renderToStaticMarkup(
      <SeletorDeResponsavel
        valor={valor}
        atendentes={atendentes}
        userId="u2"
        onEscolher={() => {}}
        {...extra}
      />,
    );
  }

  it("sem responsável: diz isso no botão", async () => {
    const html = await ver(null);
    expect(html).toContain("Sem responsável");
    expect(html).toContain('aria-label="Responsável: sem responsável"');
  });

  it("com responsável: mostra o nome e as iniciais; '(eu)' para o próprio usuário", async () => {
    const outro = await ver("u1");
    expect(outro).toContain("Aline Atendente");
    expect(outro).toContain(">AA<");
    expect(await ver("u2")).toContain("Bruno Vendas (eu)");
  });

  it("travado quando não pode atribuir (somente leitura ou salvando)", async () => {
    expect(await ver("u1", { desabilitado: true })).toContain("disabled");
  });

  it("o cabeçalho da conversa usa a lista própria, não o seletor nativo", () => {
    const tela = readFileSync("src/modules/atendimento/components/Atendimento.tsx", "utf8");
    expect(tela).toContain("<SeletorDeResponsavel");
    expect(tela).not.toContain("<select");
  });
});
