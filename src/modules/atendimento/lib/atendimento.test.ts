import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  aguardandoResposta,
  contarPorFiltro,
  filtrarConversas,
  formatarTelefone,
  iniciais,
  nomeDaConversa,
  totalNaoLidas,
  type ConversaDaLista,
} from "./conversas";
import {
  agruparPorDia,
  autoriaDaSaida,
  citacaoDe,
  marcaDeEntrega,
  textoParaExibir,
  type MensagemDaConversa,
} from "./mensagens";
import { AVISO_DO_MODO, modoDoCompositor } from "./compositor";
import { estadoDaJanela } from "../../../lib/whatsapp/cloud/janela";

const conv = (o: Partial<ConversaDaLista> = {}): ConversaDaLista => ({
  id: "c" + Math.random().toString(36).slice(2, 7),
  status: "open",
  assigned_to: null,
  department_id: null,
  last_message_at: "2026-10-15T10:00:00Z",
  last_message_preview: "oi",
  last_inbound_at: "2026-10-15T10:00:00Z",
  unread_agent: 0,
  lead_id: null,
  origin: null,
  contact: { wa_id: "5527996318075", profile_name: "Ana WhatsApp", opted_out_at: null },
  lead: null,
  ...o,
});

describe("nome e telefone", () => {
  it("lead > perfil > número", () => {
    expect(nomeDaConversa(conv({ lead: { id: "l", name: "Ana Souza", email: null } }))).toBe(
      "Ana Souza",
    );
    expect(nomeDaConversa(conv())).toBe("Ana WhatsApp");
    expect(
      nomeDaConversa(
        conv({ contact: { wa_id: "5527996318075", profile_name: null, opted_out_at: null } }),
      ),
    ).toBe("+55 (27) 99631-8075");
  });
  it("nome em branco cai para o próximo", () => {
    expect(nomeDaConversa(conv({ lead: { id: "l", name: "  ", email: null } }))).toBe(
      "Ana WhatsApp",
    );
  });
  it("formata celular e fixo BR; estrangeiro fica com +", () => {
    expect(formatarTelefone("5527996318075")).toBe("+55 (27) 99631-8075");
    expect(formatarTelefone("552733334444")).toBe("+55 (27) 3333-4444");
    expect(formatarTelefone("14155551234")).toBe("+14155551234");
    expect(formatarTelefone("")).toBe("");
  });
  it("iniciais", () => {
    expect(iniciais("Ana Souza")).toBe("AS");
    expect(iniciais("Maria da Silva Costa")).toBe("MC");
    expect(iniciais("  ")).toBe("?");
    expect(iniciais("João")).toBe("J");
  });
});

describe("filtrarConversas", () => {
  const eu = "u1";
  const lista = [
    conv({ id: "a", assigned_to: eu, last_message_at: "2026-10-15T12:00:00Z" }),
    conv({ id: "b", assigned_to: "u2", last_message_at: "2026-10-15T11:00:00Z" }),
    conv({ id: "c", assigned_to: null, last_message_at: "2026-10-15T13:00:00Z" }),
    conv({ id: "d", assigned_to: eu, status: "resolved", last_message_at: "2026-10-15T09:00:00Z" }),
  ];
  const ids = (f: Parameters<typeof filtrarConversas>[1]["filtro"]) =>
    filtrarConversas(lista, { filtro: f, userId: eu }).map((c) => c.id);

  it("minhas = comigo e não resolvidas", () => expect(ids("minhas")).toEqual(["a"]));
  it("fila = sem dono e não resolvidas", () => expect(ids("fila")).toEqual(["c"]));
  it("resolvidas", () => expect(ids("resolvidas")).toEqual(["d"]));
  it("entrada = tudo que não foi resolvido", () => expect(ids("entrada")).toEqual(["c", "a", "b"]));
  it("todas, mais recente primeiro", () => expect(ids("todas")).toEqual(["c", "a", "b", "d"]));

  it("sem usuário, 'minhas' é vazio (nunca todas)", () => {
    expect(filtrarConversas(lista, { filtro: "minhas", userId: null })).toEqual([]);
  });

  it("busca por nome, prévia e por trecho do número", () => {
    const l = [
      conv({ id: "x", lead: { id: "l", name: "Carlos Dias", email: null } }),
      conv({
        id: "y",
        last_message_preview: "quero o orçamento",
        contact: { wa_id: "5511911112222", profile_name: null, opted_out_at: null },
      }),
    ];
    const b = (q: string) =>
      filtrarConversas(l, { filtro: "todas", userId: null, busca: q }).map((c) => c.id);
    expect(b("carlos")).toEqual(["x"]);
    expect(b("orçamento")).toEqual(["y"]);
    expect(b("(11) 91111")).toEqual(["y"]);
    expect(b("")).toHaveLength(2);
  });

  it("contagens e não lidas ignoram resolvidas", () => {
    const l = [
      conv({ assigned_to: eu, unread_agent: 3 }),
      conv({ assigned_to: null, unread_agent: 2 }),
      conv({ status: "resolved", unread_agent: 9 }),
    ];
    expect(contarPorFiltro(l, eu)).toEqual({
      entrada: 2,
      minhas: 1,
      seguindo: 0,
      mencoes: 0,
      fila: 1,
      todas: 3,
      resolvidas: 1,
    });
    expect(totalNaoLidas(l)).toBe(5);
  });

  it("aguardando resposta: não lida + janela aberta", () => {
    const agora = new Date("2026-10-15T12:00:00Z");
    expect(aguardandoResposta(conv({ unread_agent: 1 }), agora)).toBe(true);
    expect(aguardandoResposta(conv({ unread_agent: 0 }), agora)).toBe(false);
    expect(
      aguardandoResposta(conv({ unread_agent: 1, last_inbound_at: "2026-10-13T00:00:00Z" }), agora),
    ).toBe(false);
    expect(aguardandoResposta(conv({ unread_agent: 1, status: "resolved" }), agora)).toBe(false);
  });
});

const msg = (o: Partial<MensagemDaConversa> = {}): MensagemDaConversa => ({
  id: "m" + Math.random().toString(36).slice(2, 7),
  direction: "outbound",
  origin: "agent",
  type: "text",
  body: "olá",
  status: "sent",
  provider_ts: "2026-10-15T15:00:00Z",
  created_at: "2026-10-15T15:00:01Z",
  template_name: null,
  sent_by: null,
  error_title: null,
  media_id: null,
  ...o,
});

describe("mensagens", () => {
  it("marca de entrega só existe na saída", () => {
    expect(marcaDeEntrega(msg({ direction: "inbound", status: "received" })).tipo).toBe("nenhuma");
    expect(marcaDeEntrega(msg({ status: "sent" })).tipo).toBe("enviada");
    expect(marcaDeEntrega(msg({ status: "delivered" })).tipo).toBe("entregue");
    expect(marcaDeEntrega(msg({ status: "read" })).tipo).toBe("lida");
    expect(marcaDeEntrega(msg({ status: "failed" })).tipo).toBe("falha");
    expect(marcaDeEntrega(msg({ status: "queued" })).tipo).toBe("relogio");
  });

  it("texto para exibir: mídia sem legenda não some", () => {
    expect(textoParaExibir({ type: "text", body: "oi", template_name: null })).toBe("oi");
    expect(textoParaExibir({ type: "image", body: null, template_name: null })).toBe("[Imagem]");
    expect(textoParaExibir({ type: "image", body: "foto da obra", template_name: null })).toBe(
      "[Imagem] foto da obra",
    );
    expect(textoParaExibir({ type: "audio", body: null, template_name: null })).toBe("[Áudio]");
    expect(
      textoParaExibir({ type: "template", body: "Olá Ana", template_name: "boas_vindas" }),
    ).toBe("Olá Ana");
    expect(textoParaExibir({ type: "template", body: null, template_name: "boas_vindas" })).toBe(
      "[Template boas_vindas]",
    );
    expect(textoParaExibir({ type: "reaction", body: "👍", template_name: null })).toBe("👍");
    expect(textoParaExibir({ type: "xyz", body: null, template_name: null })).toBe("[Mensagem]");
  });

  it("autoria da saída", () => {
    expect(autoriaDaSaida("automation")).toBe("Automação");
    expect(autoriaDaSaida("app_echo")).toBe("Pelo celular");
    expect(autoriaDaSaida("customer")).toBe("");
  });

  it("agrupa por dia no fuso de São Paulo, com Hoje/Ontem", () => {
    const agora = new Date("2026-10-15T15:00:00Z"); // 12h em SP
    const grupos = agruparPorDia(
      [
        msg({ id: "3", provider_ts: "2026-10-15T14:00:00Z" }),
        msg({ id: "1", provider_ts: "2026-10-13T14:00:00Z" }),
        msg({ id: "2", provider_ts: "2026-10-14T14:00:00Z" }),
        // 02:00 UTC de 16/10 ainda é 23:00 de 15/10 em SP → "Hoje"
        msg({ id: "4", provider_ts: "2026-10-16T02:00:00Z" }),
      ],
      agora,
    );
    expect(grupos.map((g) => g.rotulo)).toEqual(["13/10/2026", "Ontem", "Hoje"]);
    expect(grupos[2].mensagens.map((m) => m.id)).toEqual(["3", "4"]);
  });

  it("usa a hora do provedor (e não a da gravação) para ordenar", () => {
    const g = agruparPorDia(
      [
        msg({
          id: "tarde",
          provider_ts: "2026-10-15T15:10:00Z",
          created_at: "2026-10-15T15:00:00Z",
        }),
        msg({
          id: "cedo",
          provider_ts: "2026-10-15T15:05:00Z",
          created_at: "2026-10-15T15:20:00Z",
        }),
      ],
      new Date("2026-10-15T16:00:00Z"),
    );
    expect(g[0].mensagens.map((m) => m.id)).toEqual(["cedo", "tarde"]);
  });
});

describe("modo do compositor", () => {
  const aberta = estadoDaJanela("2026-10-15T11:00:00Z", new Date("2026-10-15T12:00:00Z"));
  const fechada = estadoDaJanela("2026-10-13T11:00:00Z", new Date("2026-10-15T12:00:00Z"));

  it("janela aberta → texto livre", () => {
    expect(modoDoCompositor({ janela: aberta, optedOut: false, status: "open" })).toBe("texto");
  });
  it("janela fechada → só template", () => {
    expect(modoDoCompositor({ janela: fechada, optedOut: false, status: "open" })).toBe("template");
  });
  it("opt-out vence tudo, inclusive janela aberta", () => {
    expect(modoDoCompositor({ janela: aberta, optedOut: true, status: "open" })).toBe("bloqueado");
    expect(modoDoCompositor({ janela: fechada, optedOut: true, status: "resolved" })).toBe(
      "bloqueado",
    );
  });
  it("resolvida pede reabertura", () => {
    expect(modoDoCompositor({ janela: aberta, optedOut: false, status: "resolved" })).toBe(
      "resolvida",
    );
  });
  it("todo modo restrito tem aviso; texto não", () => {
    expect(AVISO_DO_MODO.texto).toBeNull();
    for (const m of ["template", "bloqueado", "resolvida"] as const)
      expect(AVISO_DO_MODO[m]).toBeTruthy();
  });
});

describe("server functions do atendimento", () => {
  const fonte = readFileSync("src/lib/whatsapp-atendimento.functions.ts", "utf8");

  it("toda função exige autenticação", () => {
    const criadas = fonte.match(/createServerFn\(/g) ?? [];
    const protegidas = fonte.match(/\.middleware\(\[requireSupabaseAuth\]\)/g) ?? [];
    expect(criadas.length).toBeGreaterThanOrEqual(5);
    expect(protegidas.length).toBe(criadas.length);
  });

  it("a conversa é conferida contra a empresa da sessão antes de qualquer escrita", () => {
    for (const nome of [
      "enviarMensagemWhatsApp",
      "enviarTemplateWhatsApp",
      "atribuirConversaWhatsApp",
      "alterarStatusConversaWhatsApp",
    ]) {
      const corpo = fonte.slice(fonte.indexOf(`export const ${nome}`));
      const proxima = corpo.indexOf("export const ", 10);
      const trecho = proxima === -1 ? corpo : corpo.slice(0, proxima);
      expect(trecho, nome).toContain("conferirConversa(admin, companyId, data.conversaId)");
    }
  });

  it("atribuir exige que o destino seja membro da empresa", () => {
    const t = fonte.slice(fonte.indexOf("export const atribuirConversaWhatsApp"));
    expect(t).toContain('.eq("company_id", companyId)');
    expect(t).toContain("Este atendente não pertence à empresa.");
    expect(t.indexOf("Este atendente não pertence")).toBeLessThan(
      t.indexOf(".update({ assigned_to: data.userId })"),
    );
  });

  it("nenhuma função aceita companyId do navegador", () => {
    expect(fonte).not.toMatch(/companyId:\s*z\./);
  });
});

import { buscarNasMensagens } from "./mensagens";

describe("buscarNasMensagens", () => {
  const m = (id: string, body: string | null, type = "text") => ({
    id,
    type,
    body,
    template_name: null,
  });
  const lista = [
    m("1", "Quero um orçamento"),
    m("2", "ORÇAMENTO enviado"),
    m("3", "obrigado"),
    m("4", null, "image"),
  ];

  it("ignora caixa e acento e mantém a ordem da conversa", () => {
    expect(buscarNasMensagens(lista, "orcamento")).toEqual(["1", "2"]);
    expect(buscarNasMensagens(lista, "ORÇAMENTO")).toEqual(["1", "2"]);
  });

  it("menos de 2 letras não busca (casaria com tudo)", () => {
    expect(buscarNasMensagens(lista, "o")).toEqual([]);
    expect(buscarNasMensagens(lista, "  ")).toEqual([]);
  });

  it("acha mídia pelo rótulo exibido", () => {
    expect(buscarNasMensagens(lista, "imagem")).toEqual(["4"]);
  });
});

describe("menu da conversa (interligação)", () => {
  const server = readFileSync("src/lib/whatsapp-atendimento.functions.ts", "utf8");
  const fn = server.slice(server.indexOf("export const marcarConversaComoNaoLidaWhatsApp"));
  const atend = readFileSync("src/modules/atendimento/components/Atendimento.tsx", "utf8");

  it("marcar como não lida confere papel e empresa no servidor, sem apagar o que já era não lido", () => {
    expect(fn).toContain("empresaParaAtender(admin, context.userId)");
    expect(fn).toContain("conferirConversa(admin, companyId, data.conversaId)");
    expect(fn).toContain('.eq("unread_agent", 0)');
  });

  it("depois de marcar como não lida a conversa fecha (senão a leitura automática a zeraria)", () => {
    const i = atend.indexOf("const aoMarcarNaoLida");
    expect(atend.slice(i, i + 400)).toContain("abrirConversa(null)");
  });

  it("pendente usa o mesmo status do banco, sem campo novo", () => {
    expect(atend).toContain('status: ativa.status === "pending" ? "open" : "pending"');
  });
});

describe("seguindo e menções (conjuntos pessoais)", () => {
  const lista = [conv({ id: "a" }), conv({ id: "b", status: "resolved" }), conv({ id: "c" })];
  const seguindo = new Set(["a", "b"]);
  const mencoes = new Set(["c", "b"]);
  const ids = (f: "seguindo" | "mencoes") =>
    filtrarConversas(lista, { filtro: f, userId: "u1", seguindo, mencoes })
      .map((c) => c.id)
      .sort();

  it("seguindo = que a pessoa segue e não foram resolvidas", () =>
    expect(ids("seguindo")).toEqual(["a"]));
  it("menções = com menção não lida, mesmo resolvida (alguém te chamou)", () =>
    expect(ids("mencoes")).toEqual(["b", "c"]));
  it("sem os conjuntos, as visões ficam vazias (nunca todas)", () => {
    expect(filtrarConversas(lista, { filtro: "seguindo", userId: "u1" })).toEqual([]);
    expect(filtrarConversas(lista, { filtro: "mencoes", userId: "u1" })).toEqual([]);
  });
  it("as contagens usam os mesmos conjuntos", () => {
    const c = contarPorFiltro(lista, "u1", { seguindo, mencoes });
    expect([c.seguindo, c.mencoes]).toEqual([1, 2]);
  });
});

describe("seguir e menções (servidor)", () => {
  const server = readFileSync("src/lib/whatsapp-atendimento.functions.ts", "utf8");
  const corpo = (nome: string) => {
    const i = server.indexOf(`export const ${nome}`);
    const j = server.indexOf("\nexport const ", i + 10);
    return server.slice(i, j === -1 ? undefined : j);
  };

  it("seguir confere papel e empresa e nunca grava por outra pessoa", () => {
    const f = corpo("seguirConversaWhatsApp");
    expect(f).toContain("empresaParaAtender(admin, context.userId)");
    expect(f).toContain("conferirConversa(admin, companyId, data.conversaId)");
    expect(f).toContain('.eq("user_id", context.userId)');
    expect(f).not.toContain("data.userId");
  });

  it("menção só vale para membro da empresa e não para si mesmo; o mencionado passa a seguir", () => {
    const f = corpo("criarNotaWhatsApp");
    expect(f).toContain('.eq("company_id", companyId)');
    expect(f).toContain('.in("user_id", alvos)');
    expect(f).toContain("id !== context.userId");
    expect(f).toContain("seguir(admin, companyId, data.conversaId, uid)");
  });

  it("quem recebe a conversa passa a segui-la", () => {
    expect(corpo("atribuirConversaWhatsApp")).toContain(
      "seguir(admin, companyId, data.conversaId, data.userId)",
    );
  });

  it("ler a conversa lê só as menções DA pessoa", () => {
    const f = corpo("marcarMencoesComoLidasWhatsApp");
    expect(f).toContain('.eq("mentioned_user_id", context.userId)');
    expect(f).toContain('.is("read_at", null)');
  });
});

describe("citação de resposta", () => {
  const base = { type: "text", status: "received", provider_ts: null, created_at: "", template_name: null, sent_by: null, error_title: null, media_id: null, origin: "customer" } as const;
  const orig = { ...base, id: "o1", direction: "inbound", body: "Qual o valor do apartamento de 2 quartos?" } as MensagemDaConversa;
  const resp = { ...base, id: "r1", direction: "outbound", origin: "agent", body: "R$ 400 mil", reply_to: "o1" } as MensagemDaConversa;
  it("resume a original e diz de quem era", () => {
    expect(citacaoDe(resp, [orig, resp])).toEqual({ id: "o1", texto: "Qual o valor do apartamento de 2 quartos?", doCliente: true });
  });
  it("texto longo é cortado com reticências", () => {
    const longa = { ...orig, body: "x".repeat(300) };
    const c = citacaoDe(resp, [longa, resp])!;
    expect(c.texto.length).toBe(90);
    expect(c.texto.endsWith("…")).toBe(true);
  });
  it("sem reply_to ou com original fora da lista não há citação", () => {
    expect(citacaoDe({ ...resp, reply_to: null }, [orig, resp])).toBeNull();
    expect(citacaoDe(resp, [resp])).toBeNull();
  });
  it("mídia sem legenda vira o rótulo do tipo, não texto vazio", () => {
    const img = { ...orig, type: "image", body: null } as MensagemDaConversa;
    expect(citacaoDe(resp, [img, resp])!.texto).toMatch(/Imagem/i);
  });
});
