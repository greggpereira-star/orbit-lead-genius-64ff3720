import { createHash, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrarToken } from "./cifra";
import { criarDb, rotearFetch } from "./dbFalso";
import { baixarEGuardarMidia, urlDaMidia, type DbComArmazenamento } from "./armazenamento";
import { enviarMidiaNaConversa } from "./envio";
import {
  caminhoDeEntrada,
  caminhoDeSaida,
  caminhoEhDaEmpresa,
  classificarArquivoParaEnvio,
  extensaoDoMime,
  extrairMidia,
  nomeSeguro,
  urlDeMidiaDaMetaEhSegura,
} from "./midia";
import { processarEvento } from "./processador";

const MB = 1024 * 1024;

describe("extrairMidia", () => {
  it("imagem, áudio de voz, documento com nome", () => {
    expect(
      extrairMidia("image", { image: { id: "M1", mime_type: "image/jpeg", sha256: "abc" } }),
    ).toMatchObject({
      kind: "image",
      providerMediaId: "M1",
      mime: "image/jpeg",
      sha256: "abc",
      voz: false,
    });
    expect(
      extrairMidia("audio", {
        audio: { id: "A1", mime_type: "audio/ogg; codecs=opus", voice: true },
      }),
    ).toMatchObject({ voz: true });
    expect(
      extrairMidia("document", { document: { id: "D1", filename: "orçamento.pdf" } }),
    ).toMatchObject({ filename: "orçamento.pdf" });
  });
  it("texto, tipo sem id e payload torto não são mídia", () => {
    expect(extrairMidia("text", { text: { body: "oi" } })).toBeNull();
    expect(extrairMidia("image", { image: {} })).toBeNull();
    expect(extrairMidia("image", {})).toBeNull();
    expect(extrairMidia("image", { image: "x" })).toBeNull();
  });
});

describe("classificarArquivoParaEnvio", () => {
  it("imagem JPEG/PNG até 5 MB vai como imagem", () => {
    expect(classificarArquivoParaEnvio({ mime: "image/png", bytes: 2 * MB })).toEqual({
      ok: true,
      tipo: "image",
    });
  });
  it("imagem acima de 5 MB é recusada com o limite", () => {
    const r = classificarArquivoParaEnvio({ mime: "image/jpeg", bytes: 6 * MB });
    expect(r.ok).toBe(false);
    expect((r as { texto: string }).texto).toContain("5 MB");
  });
  it("formato de imagem fora da lista (webp, gif) NÃO vira documento sozinho", () => {
    const r = classificarArquivoParaEnvio({ mime: "image/gif", bytes: 1000 });
    expect(r.ok).toBe(false);
    expect((r as { texto: string }).texto).toContain("documento");
  });
  it("mas pode ser enviado como documento se o autor pedir", () => {
    expect(
      classificarArquivoParaEnvio({ mime: "image/gif", bytes: 1000, forcarDocumento: true }),
    ).toEqual({ ok: true, tipo: "document" });
  });
  it("PDF e planilha são documentos; vídeo e áudio têm seus limites", () => {
    expect(classificarArquivoParaEnvio({ mime: "application/pdf", bytes: 3 * MB })).toEqual({
      ok: true,
      tipo: "document",
    });
    expect(classificarArquivoParaEnvio({ mime: "video/mp4", bytes: 10 * MB })).toEqual({
      ok: true,
      tipo: "video",
    });
    expect(classificarArquivoParaEnvio({ mime: "video/mp4", bytes: 17 * MB }).ok).toBe(false);
    expect(classificarArquivoParaEnvio({ mime: "audio/ogg", bytes: 1 * MB })).toEqual({
      ok: true,
      tipo: "audio",
    });
    expect(classificarArquivoParaEnvio({ mime: "video/webm", bytes: 1 * MB }).ok).toBe(false);
  });
  it("documento acima do nosso teto de 20 MB é recusado", () => {
    expect(classificarArquivoParaEnvio({ mime: "application/pdf", bytes: 21 * MB }).ok).toBe(false);
  });
  it("vazio e sem tipo", () => {
    expect(classificarArquivoParaEnvio({ mime: "image/png", bytes: 0 }).ok).toBe(false);
    expect(classificarArquivoParaEnvio({ mime: "", bytes: 10 }).ok).toBe(false);
  });
});

describe("caminhos", () => {
  it("nomeSeguro tira acento, barra e ponto inicial", () => {
    expect(nomeSeguro("Orçamento Obra #3.pdf")).toBe("Orcamento_Obra_3.pdf");
    expect(nomeSeguro("../../etc/passwd")).toBe("passwd");
    expect(nomeSeguro("...")).toBe("arquivo");
    expect(nomeSeguro("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
  it("saída começa pela empresa; entrada guarda a extensão", () => {
    expect(caminhoDeSaida("emp", "foto.png", "uuid")).toBe("emp/saida/uuid-foto.png");
    expect(caminhoDeEntrada("emp", "MEDIA1", "image/jpeg")).toBe("emp/entrada/MEDIA1.jpg");
    expect(extensaoDoMime("audio/ogg; codecs=opus")).toBe(".ogg");
    expect(extensaoDoMime("application/x-desconhecido")).toBe("");
  });
  it("posse do caminho: só o prefixo da empresa, sem escapar", () => {
    expect(caminhoEhDaEmpresa("emp/saida/x.png", "emp")).toBe(true);
    expect(caminhoEhDaEmpresa("outra/saida/x.png", "emp")).toBe(false);
    expect(caminhoEhDaEmpresa("emp/entrada/x.png", "emp")).toBe(false);
    expect(caminhoEhDaEmpresa("emp/saida/../../outra/x.png", "emp")).toBe(false);
    expect(caminhoEhDaEmpresa("emp/saida//x.png", "emp")).toBe(false);
  });
});

/** Armazenamento de mentira. */
function armazenamentoFalso(opts: { falhaNoUpload?: boolean } = {}) {
  const guardados = new Map<string, { corpo: Uint8Array; contentType?: string }>();
  const storage = {
    from: () => ({
      upload: async (
        caminho: string,
        corpo: ArrayBuffer | Uint8Array,
        o?: { contentType?: string },
      ) => {
        if (opts.falhaNoUpload) return { data: null, error: { message: "bucket cheio" } };
        guardados.set(caminho, {
          corpo: new Uint8Array(corpo as ArrayBuffer),
          contentType: o?.contentType,
        });
        return { data: {}, error: null };
      },
      createSignedUrl: async (caminho: string, s: number) => ({
        data: { signedUrl: `https://storage.exemplo/${caminho}?t=${s}` },
        error: null,
      }),
      createSignedUploadUrl: async (caminho: string) => ({
        data: { signedUrl: "https://up", token: "tok", path: caminho },
        error: null,
      }),
    }),
  };
  return { storage, guardados };
}

describe("baixarEGuardarMidia", () => {
  const chave = randomBytes(32).toString("base64");
  beforeEach(() => vi.stubEnv("WA_TOKEN_KEY", chave));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const bytes = Buffer.from("conteudo-da-imagem");
  const sha = createHash("sha256").update(bytes).digest("hex");

  const montar = (over: { sha?: string; status?: string; falhaNoUpload?: boolean } = {}) => {
    const arm = armazenamentoFalso({ falhaNoUpload: over.falhaNoUpload });
    const base = criarDb({
      tabelas: {
        wa_media: {
          id: "med1",
          company_id: "emp",
          provider_media_id: "MEDIA1",
          mime: "image/jpeg",
          sha256: over.sha ?? sha,
          status: over.status ?? "pending",
          storage_path: null,
          attempts: 0,
        },
        wa_accounts: { id: "acc1", waba_id: "W" },
        wa_credentials: { access_token_enc: cifrarToken("TOK", chave) },
      },
    });
    return {
      ...base,
      db: Object.assign(base.db, { storage: arm.storage }) as DbComArmazenamento,
      guardados: arm.guardados,
    };
  };

  it("baixa pela URL temporária com o token, confere o hash e guarda no bucket", async () => {
    const { f, chamadas } = rotearFetch({
      "/MEDIA1": {
        corpo: {
          url: "https://lookaside.fbsbx.com/arquivo",
          mime_type: "image/jpeg",
          sha256: sha,
          file_size: bytes.length,
        },
      },
    });
    // a URL do arquivo responde com os bytes crus
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).startsWith("https://lookaside")) {
        expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer TOK");
        return new Response(bytes, { status: 200 });
      }
      return f(url, init);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { db, ops, guardados } = montar();
    const r = await baixarEGuardarMidia(db, "med1");
    expect(r).toMatchObject({ ok: true, caminho: "emp/entrada/MEDIA1.jpg", jaGuardada: false });
    expect(guardados.get("emp/entrada/MEDIA1.jpg")?.contentType).toBe("image/jpeg");
    const up = ops.filter((o) => o.tabela === "wa_media" && o.op === "update").pop()!;
    expect(up.args[0]).toMatchObject({
      status: "stored",
      storage_path: "emp/entrada/MEDIA1.jpg",
      size_bytes: bytes.length,
    });
    expect(chamadas.length).toBeGreaterThan(0);
  });

  it("hash que NÃO confere: não guarda e marca como falha", async () => {
    const f = vi.fn(async (url: string) =>
      String(url).includes("lookaside")
        ? new Response(bytes, { status: 200 })
        : new Response(
            JSON.stringify({ url: "https://lookaside.fbsbx.com/x", sha256: "f".repeat(64) }),
            { status: 200 },
          ),
    );
    vi.stubGlobal("fetch", f);
    const { db, guardados, ops } = montar();
    const r = await baixarEGuardarMidia(db, "med1");
    expect(r).toMatchObject({ ok: false });
    expect(guardados.size).toBe(0);
    expect(ops.filter((o) => o.op === "update").pop()!.args[0]).toMatchObject({ status: "failed" });
  });

  it("mídia que a Meta já não serve (404) vira 'expired'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 100, message: "gone" } }), { status: 404 }),
      ),
    );
    const { db, ops } = montar();
    const r = await baixarEGuardarMidia(db, "med1");
    expect(r).toMatchObject({ ok: false, expirou: true });
    expect(ops.filter((o) => o.op === "update").pop()!.args[0]).toMatchObject({
      status: "expired",
    });
  });

  it("arquivo acima do teto não é baixado", async () => {
    const f = vi.fn(
      async () =>
        new Response(JSON.stringify({ url: "https://l/x", file_size: 30 * MB }), { status: 200 }),
    );
    vi.stubGlobal("fetch", f);
    const { db } = montar();
    expect(await baixarEGuardarMidia(db, "med1")).toMatchObject({ ok: false });
    expect(f).toHaveBeenCalledTimes(1); // só os metadados; nunca o arquivo
  });

  it("falha do bucket não vira 'stored'", async () => {
    const f = vi.fn(async (url: string) =>
      String(url).includes("lookaside")
        ? new Response(bytes, { status: 200 })
        : new Response(JSON.stringify({ url: "https://lookaside.fbsbx.com/x", sha256: sha }), {
            status: 200,
          }),
    );
    vi.stubGlobal("fetch", f);
    const { db, ops } = montar({ falhaNoUpload: true });
    expect(await baixarEGuardarMidia(db, "med1")).toMatchObject({ ok: false });
    expect(ops.filter((o) => o.op === "update").pop()!.args[0]).toMatchObject({ status: "failed" });
  });

  it("já guardada: não baixa de novo", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const { db } = montar({ status: "stored" });
    // `storage_path` precisa existir para contar como guardada
    (db as unknown as { from: (t: string) => unknown }).from = () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: "med1",
              company_id: "emp",
              status: "stored",
              storage_path: "emp/entrada/x.jpg",
            },
          }),
        }),
      }),
    });
    expect(await baixarEGuardarMidia(db, "med1")).toMatchObject({ ok: true, jaGuardada: true });
    expect(f).not.toHaveBeenCalled();
  });
});

describe("urlDaMidia — a mídia é da empresa da sessão", () => {
  it("mídia de OUTRA empresa é tratada como inexistente", async () => {
    const arm = armazenamentoFalso();
    const { db } = criarDb({
      tabelas: {
        wa_media: { id: "m", company_id: "OUTRA", status: "stored", storage_path: "OUTRA/x.jpg" },
      },
    });
    const r = await urlDaMidia(
      Object.assign(db, { storage: arm.storage }) as DbComArmazenamento,
      "emp",
      "m",
    );
    expect(r).toMatchObject({ ok: false, estado: "inexistente" });
  });

  it("guardada: devolve URL assinada curta", async () => {
    const arm = armazenamentoFalso();
    const { db } = criarDb({
      tabelas: {
        wa_media: {
          id: "m",
          company_id: "emp",
          status: "stored",
          storage_path: "emp/entrada/x.jpg",
          mime: "image/jpeg",
          kind: "image",
        },
      },
    });
    const r = await urlDaMidia(
      Object.assign(db, { storage: arm.storage }) as DbComArmazenamento,
      "emp",
      "m",
      300,
    );
    expect(r).toMatchObject({ ok: true, mime: "image/jpeg", tipo: "image" });
    expect((r as { url: string }).url).toContain("t=300");
  });
});

describe("processarEvento registra e baixa a mídia", () => {
  it("mensagem de imagem aciona wa_registrar_midia", async () => {
    const { db, rpcs } = criarDb({
      rpc: {
        wa_registrar_mensagem: {
          data: [{ out_conversa: "c1", out_mensagem: "m1", out_empresa: "emp", inserida: true }],
        },
        wa_registrar_midia: { data: "med1" },
      },
      tabelas: { wa_conversations: { contact_id: "k", lead_id: "L" } },
    });
    await processarEvento(db, {
      kind: "message",
      dedupKey: "msg:w",
      phoneNumberId: "PNID",
      waId: "5527996318075",
      profileName: null,
      wamid: "w",
      type: "image",
      body: null,
      payload: { image: { id: "MEDIA1", mime_type: "image/jpeg", sha256: "abc" } },
      ts: "2026-10-15T10:00:00.000Z",
      referral: null,
      replyToWamid: null,
    });
    const r = rpcs.find((x) => x.fn === "wa_registrar_midia")!;
    expect(r.args).toMatchObject({
      p_message_id: "m1",
      p_kind: "image",
      p_provider_media_id: "MEDIA1",
    });
  });

  it("reentrega não registra mídia de novo", async () => {
    const { db, rpcs } = criarDb({
      rpc: {
        wa_registrar_mensagem: {
          data: [{ out_conversa: "c1", out_mensagem: "m1", out_empresa: "emp", inserida: false }],
        },
      },
    });
    await processarEvento(db, {
      kind: "message",
      dedupKey: "x",
      phoneNumberId: "P",
      waId: "5527",
      profileName: null,
      wamid: "w",
      type: "image",
      body: null,
      payload: { image: { id: "M" } },
      ts: "2026-10-15T10:00:00.000Z",
      referral: null,
      replyToWamid: null,
    });
    expect(rpcs.some((x) => x.fn === "wa_registrar_midia")).toBe(false);
  });
});

describe("enviarMidiaNaConversa", () => {
  const chave = randomBytes(32).toString("base64");
  const base = {
    conversaId: "c1",
    tipo: "image" as const,
    caminho: "emp/saida/u-foto.png",
    mime: "image/png",
    nomeDoArquivo: "foto.png",
    legenda: "Veja a obra",
    enviadoPor: "u1",
    origem: "agent" as const,
    agora: new Date("2026-10-15T12:00:00Z"),
  };
  const tabelas = (over: { last?: string | null; opted?: string | null } = {}) => ({
    wa_conversations: {
      id: "c1",
      company_id: "emp",
      phone_number_id: "np1",
      contact_id: "k1",
      last_inbound_at: over.last === undefined ? "2026-10-15T10:00:00Z" : over.last,
    },
    wa_contacts: { wa_id: "5527996318075", opted_out_at: over.opted ?? null },
    wa_phone_numbers: { phone_number_id: "PNID", account_id: "acc1" },
    wa_credentials: { access_token_enc: cifrarToken("TOK", chave) },
    whatsapp_optouts: [],
  });
  let fetchMock: ReturnType<typeof vi.fn>;
  let envios: () => unknown[][];
  beforeEach(() => {
    vi.stubEnv("WA_TOKEN_KEY", chave);
    fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      // HEAD = conferência de que o arquivo existe no bucket; POST = Graph.
      init?.method === "HEAD"
        ? new Response(null, { status: 200 })
        : new Response(JSON.stringify({ messages: [{ id: "wamid.MED" }] }), { status: 200 }),
    );
    envios = () =>
      fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method !== "HEAD");
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const com = (t: ReturnType<typeof tabelas>) => {
    const arm = armazenamentoFalso();
    const x = criarDb({
      tabelas: t,
      rpc: { wa_registrar_saida: { data: "m1" }, wa_registrar_midia: { data: "med" } },
    });
    return { ...x, db: Object.assign(x.db, { storage: arm.storage }) as DbComArmazenamento };
  };

  it("janela aberta: manda o LINK assinado e registra mensagem + mídia", async () => {
    const { db, rpcs } = com(tabelas());
    const r = await enviarMidiaNaConversa(db, base);
    expect(r).toMatchObject({ ok: true, providerMessageId: "wamid.MED" });
    const corpo = JSON.parse(String((envios()[0] as [string, RequestInit])[1].body));
    expect(corpo).toMatchObject({ type: "image", to: "5527996318075" });
    expect(corpo.image.link).toContain("https://storage.exemplo/emp/saida/u-foto.png");
    expect(corpo.image.caption).toBe("Veja a obra");
    expect(rpcs.find((x) => x.fn === "wa_registrar_midia")!.args).toMatchObject({
      p_storage_path: "emp/saida/u-foto.png",
      p_provider_media_id: null,
    });
  });

  it("áudio não leva legenda; documento leva o nome do arquivo", async () => {
    const { db } = com(tabelas());
    await enviarMidiaNaConversa(db, {
      ...base,
      tipo: "audio",
      mime: "audio/ogg",
      legenda: "ignorar",
    });
    let corpo = JSON.parse(String((envios()[0] as [string, RequestInit])[1].body));
    expect(corpo.audio.caption).toBeUndefined();

    await enviarMidiaNaConversa(db, {
      ...base,
      tipo: "document",
      nomeDoArquivo: "orcamento.pdf",
      mime: "application/pdf",
    });
    corpo = JSON.parse(String((envios()[1] as [string, RequestInit])[1].body));
    expect(corpo.document.filename).toBe("orcamento.pdf");
  });

  it("arquivo que não existe no bucket não chega à Meta", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 404 }));
    const { db } = com(tabelas());
    expect(await enviarMidiaNaConversa(db, base)).toMatchObject({
      ok: false,
      motivo: "arquivo_indisponivel",
    });
    expect(envios()).toHaveLength(0);
  });

  it("o nome do arquivo é saneado antes de sair e de ser gravado", async () => {
    const { db, rpcs } = com(tabelas());
    await enviarMidiaNaConversa(db, {
      ...base,
      tipo: "document",
      mime: "application/pdf",
      nomeDoArquivo: "../../etc/passwd\r\nX: y.pdf",
    });
    const corpo = JSON.parse(String((envios()[0] as [string, RequestInit])[1].body));
    expect(corpo.document.filename).toBe("passwd_X_y.pdf");
    expect(
      (rpcs.find((x) => x.fn === "wa_registrar_saida")!.args as { p_payload: unknown }).p_payload,
    ).toEqual({ document: { filename: "passwd_X_y.pdf", mime_type: "application/pdf" } });
  });

  it("janela FECHADA e opt-out não chamam a Meta", async () => {
    let x = com(tabelas({ last: "2026-10-12T10:00:00Z" }));
    expect(await enviarMidiaNaConversa(x.db, base)).toMatchObject({
      ok: false,
      motivo: "fora_da_janela",
    });
    x = com(tabelas({ opted: "2026-10-14T00:00:00Z" }));
    expect(await enviarMidiaNaConversa(x.db, base)).toMatchObject({
      ok: false,
      motivo: "contato_pediu_para_parar",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("download: a URL da Meta e o teto de leitura", () => {
  it("só aceita https em domínio da Meta, sem credencial, porta ou parente falso", async () => {
    const { urlDeMidiaDaMetaEhSegura: ok } = await import("./midia");
    expect(ok("https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1")).toBe(true);
    expect(ok("https://scontent.xx.fbcdn.net/v/abc")).toBe(true);
    expect(ok("http://lookaside.fbsbx.com/x")).toBe(false);
    expect(ok("https://fbsbx.com.evil.com/x")).toBe(false);
    expect(ok("https://evilfbsbx.com/x")).toBe(false);
    expect(ok("https://user:pw@lookaside.fbsbx.com/x")).toBe(false);
    expect(ok("https://lookaside.fbsbx.com:8443/x")).toBe(false);
    expect(ok("https://169.254.169.254/latest")).toBe(false);
    expect(ok("not a url")).toBe(false);
  });

  it("lerCorpoComTeto para no teto, mesmo sem content-length", async () => {
    const { lerCorpoComTeto } = await import("./midia");
    const grande = new Response(new Uint8Array(1000));
    expect(await lerCorpoComTeto(grande, 100)).toBeNull();
    const pequeno = new Response(new Uint8Array(50));
    expect((await lerCorpoComTeto(pequeno, 100))?.byteLength).toBe(50);
    const declarado = new Response("x", { headers: { "content-length": "5000" } });
    expect(await lerCorpoComTeto(declarado, 100)).toBeNull();
  });
});

describe("URL de mídia no ensaio local (desvio da Graph API)", () => {
  const local = { META_GRAPH_BASE_URL: "http://127.0.0.1:9911/v25.0" };
  it("aceita só a mesma origem do servidor de mentira", () => {
    expect(urlDeMidiaDaMetaEhSegura("http://127.0.0.1:9911/baixar/m1", local)).toBe(true);
    expect(urlDeMidiaDaMetaEhSegura("http://127.0.0.1:9999/baixar/m1", local)).toBe(false);
    expect(urlDeMidiaDaMetaEhSegura("http://localhost:9911/baixar/m1", local)).toBe(false);
  });
  it("sem o desvio (produção), localhost continua recusado", () => {
    expect(urlDeMidiaDaMetaEhSegura("http://127.0.0.1:9911/baixar/m1", {})).toBe(false);
  });
  it("desvio para host externo é ignorado: nenhuma exceção", () => {
    expect(urlDeMidiaDaMetaEhSegura("https://evil.example/x", { META_GRAPH_BASE_URL: "https://evil.example/v25.0" })).toBe(false);
  });
});
