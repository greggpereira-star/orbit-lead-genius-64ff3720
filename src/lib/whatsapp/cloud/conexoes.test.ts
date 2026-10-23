import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cifrarToken } from "./cifra";
import { estadoEfetivo, montarConexoes, pedeAtencao, telefoneLegivel } from "./conexoes";
import { criarDb, rotearFetch } from "./dbFalso";
import { lerSaudeDaConexao } from "./onboarding";
import { interpretarSaudeDaMeta } from "./saudeDoNumero";

describe("interpretarSaudeDaMeta (health_status)", () => {
  it("AVAILABLE: pode enviar; qualidade e limite vêm do número", () => {
    const s = interpretarSaudeDaMeta({
      health_status: { can_send_message: "AVAILABLE", entities: [] },
      status: "CONNECTED",
      quality_rating: "GREEN",
      messaging_limit_tier: "TIER_250",
    });
    expect(s.envio).toMatchObject({ nivel: "ok", rotulo: "Pode enviar", pontos: [] });
    expect(s.status.rotulo).toBe("Conectado na Meta");
    expect(s.qualidade).toMatchObject({ nivel: "alta", rotulo: "Alta" });
    expect(s.limite).toBe("250 contatos novos por 24 h");
  });

  it("LIMITED: 'Alcance limitado' e só os itens limitados, com a origem em português", () => {
    const s = interpretarSaudeDaMeta({
      health_status: {
        can_send_message: "LIMITED",
        entities: [
          {
            entity_type: "PHONE_NUMBER",
            id: "1",
            can_send_message: "LIMITED",
            additional_info: ["Tier 1 limit"],
          },
          { entity_type: "WABA", id: "2", can_send_message: "AVAILABLE" },
        ],
      },
    });
    expect(s.envio.nivel).toBe("limitado");
    expect(s.envio.rotulo).toBe("Alcance limitado");
    expect(s.envio.pontos).toEqual([{ origem: "Número", texto: "Tier 1 limit", solucao: null }]);
  });

  it("BLOCKED: traz o erro e a solução sugerida pela Meta", () => {
    const s = interpretarSaudeDaMeta({
      health_status: {
        can_send_message: "BLOCKED",
        entities: [
          {
            entity_type: "BUSINESS",
            id: "9",
            can_send_message: "BLOCKED",
            errors: [
              {
                error_code: 141000,
                error_description: "Business verification is required",
                possible_solution: "Verify your business",
              },
            ],
          },
        ],
      },
    });
    expect(s.envio).toMatchObject({ nivel: "bloqueado", rotulo: "Envio bloqueado" });
    expect(s.envio.pontos).toEqual([
      {
        origem: "Empresa (portfólio)",
        texto: "Business verification is required",
        solucao: "Verify your business",
      },
    ]);
  });

  it("BLOCKED só por 'business initiated': diz que responder dentro de 24 h segue funcionando", () => {
    const s = interpretarSaudeDaMeta({
      health_status: {
        can_send_message: "BLOCKED",
        entities: [
          {
            entity_type: "WABA",
            id: "1",
            can_send_message: "BLOCKED",
            errors: [
              {
                error_code: 141006,
                error_description:
                  "There is an error with the payment method. This will block business initiated conversations.",
                possible_solution: "Add a new payment method to the account.",
              },
            ],
          },
        ],
      },
    });
    expect(s.envio).toMatchObject({
      nivel: "bloqueado",
      rotulo: "Mensagens ativas bloqueadas",
      alcance: "ativas",
    });
    expect(s.envio.descricao).toContain("dentro de 24 h");
  });

  it("BLOCKED misto ou sem esse motivo continua sendo bloqueio total", () => {
    const s = interpretarSaudeDaMeta({
      health_status: {
        can_send_message: "BLOCKED",
        entities: [
          {
            entity_type: "PHONE_NUMBER",
            id: "1",
            can_send_message: "BLOCKED",
            errors: [{ error_code: 1, error_description: "The phone number is not verified." }],
          },
          {
            entity_type: "WABA",
            id: "2",
            can_send_message: "BLOCKED",
            errors: [
              {
                error_code: 2,
                error_description: "This will block business initiated conversations.",
              },
            ],
          },
        ],
      },
    });
    expect(s.envio).toMatchObject({ rotulo: "Envio bloqueado", alcance: "total" });
  });

  it("sem health_status (ou lixo): 'Sem informação da Meta', nunca 'Pode enviar'", () => {
    for (const bruto of [
      undefined,
      null,
      "x",
      {},
      { health_status: "?" },
      { health_status: { can_send_message: "NOVO" } },
    ]) {
      const s = interpretarSaudeDaMeta(bruto);
      expect(s.envio.nivel).toBe("desconhecido");
      expect(s.limite).toBeNull();
      expect(s.qualidade.nivel).toBe("desconhecida");
    }
  });
});

describe("montarConexoes", () => {
  const numero = {
    phone_number_id: "PN1",
    display_phone: "5527995329839",
    mode: "cloud_only" as const,
    status: "active" as const,
    receive_only: true,
    webhook_subscribed_at: "2026-10-21T10:00:00Z",
    disconnection_reason: null,
    created_at: "2026-10-13T10:00:00Z",
    account: { waba_id: "W1", display_name: "Peticolé" },
  };

  it("oficial: tipo, provedor Meta (direto), telefone legível e dados do número", () => {
    const [c] = montarConexoes({ numeros: [numero], instancias: [] });
    expect(c).toMatchObject({
      id: "PN1",
      tipo: "oficial",
      tipoRotulo: "WhatsApp Business API",
      provedor: "Meta (direto)",
      nome: "Peticolé",
      telefone: "+55 27 99532-9839",
      estado: "conectado",
    });
    expect(c.oficial).toMatchObject({ wabaId: "W1", apenasReceptivo: true, modo: "cloud_only" });
    expect(c.qr).toBeNull();
  });

  it("sem nome da conta, o nome é o número; desconectado vem do banco", () => {
    const [c] = montarConexoes({
      numeros: [{ ...numero, account: null, status: "disconnected" }],
      instancias: [],
    });
    expect(c.nome).toBe("WhatsApp oficial +55 27 99532-9839");
    expect(c.estado).toBe("desconectado");
  });

  it("QR code entra na mesma lista, com provedor Evolution", () => {
    const lista = montarConexoes({
      numeros: [numero],
      instancias: [
        {
          id: "i1",
          status: "connected",
          phone_number: "5527999990000",
          last_connected_at: null,
          last_error: null,
          created_at: null,
        },
      ],
    });
    expect(lista.map((c) => c.tipo)).toEqual(["oficial", "qr"]);
    expect(lista[1]).toMatchObject({
      provedor: "Evolution API",
      estado: "conectado",
      tipoRotulo: "WhatsApp (QR code)",
    });
  });

  it("telefoneLegivel: BR, fixo, internacional e vazio", () => {
    expect(telefoneLegivel("5527995329839")).toBe("+55 27 99532-9839");
    expect(telefoneLegivel("552733334444")).toBe("+55 27 3333-4444");
    expect(telefoneLegivel("15559449118")).toBe("+15559449118");
    expect(telefoneLegivel("")).toBeNull();
    expect(telefoneLegivel(null)).toBeNull();
  });
});

describe("estadoEfetivo e pedeAtencao", () => {
  const [conectada] = montarConexoes({
    numeros: [
      {
        phone_number_id: "PN1",
        display_phone: "5527995329839",
        mode: "cloud_only",
        status: "active",
        receive_only: false,
        webhook_subscribed_at: null,
        disconnection_reason: null,
        created_at: null,
      },
    ],
    instancias: [],
  });
  const pendente = interpretarSaudeDaMeta({
    status: "PENDING",
    health_status: { can_send_message: "BLOCKED", entities: [] },
  });
  const limitada = interpretarSaudeDaMeta({
    status: "CONNECTED",
    health_status: { can_send_message: "LIMITED", entities: [] },
  });
  const ok = interpretarSaudeDaMeta({
    status: "CONNECTED",
    health_status: { can_send_message: "AVAILABLE" },
  });

  it("'Ativo aqui' mas pendente na Meta vira pendente; desconectado aqui continua desconectado", () => {
    expect(estadoEfetivo(conectada, pendente)).toBe("pendente");
    expect(estadoEfetivo(conectada, ok)).toBe("conectado");
    expect(estadoEfetivo(conectada, null)).toBe("conectado");
    expect(estadoEfetivo({ ...conectada, estado: "desconectado" }, pendente)).toBe("desconectado");
  });

  it("pede atenção quando limitada, bloqueada ou pendente; não quando ok ou desconhecida", () => {
    expect(pedeAtencao(limitada)).toBe(true);
    expect(pedeAtencao(pendente)).toBe(true);
    expect(pedeAtencao(ok)).toBe(false);
    expect(pedeAtencao(interpretarSaudeDaMeta({}))).toBe(false);
    expect(pedeAtencao(null)).toBe(false);
  });
});

describe("lerSaudeDaConexao (servidor)", () => {
  const chave = randomBytes(32).toString("base64");
  beforeEach(() => vi.stubEnv("WA_TOKEN_KEY", chave));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("número que não é da empresa: não chama a Meta", async () => {
    const { f } = rotearFetch({});
    vi.stubGlobal("fetch", f);
    const { db } = criarDb({ tabelas: {} });
    expect(await lerSaudeDaConexao(db, "emp", "123456")).toEqual({
      ok: false,
      texto: "Conexão não encontrada.",
    });
    expect(f).not.toHaveBeenCalled();
  });

  it("lê com o token da conta DO número, devolve a saúde interpretada e não vaza o token", async () => {
    const { f, chamadas } = rotearFetch({
      "/123456": {
        corpo: {
          status: "CONNECTED",
          quality_rating: "YELLOW",
          health_status: { can_send_message: "AVAILABLE" },
        },
      },
    });
    vi.stubGlobal("fetch", f);
    const { db } = criarDb({
      tabelas: {
        wa_phone_numbers: { account_id: "acc1" },
        wa_accounts: { id: "acc1", waba_id: "W" },
        wa_credentials: { access_token_enc: cifrarToken("SEGREDO-TOK", chave) },
      },
    });
    const r = await lerSaudeDaConexao(db, "emp", "123456");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.saude.qualidade.nivel).toBe("media");
    expect((chamadas[0].init.headers as Record<string, string>).Authorization).toBe(
      "Bearer SEGREDO-TOK",
    );
    expect(chamadas[0].url).toContain("fields=health_status");
    expect(JSON.stringify(r)).not.toContain("SEGREDO-TOK");
  });

  it("erro da Meta volta em português e sem lançar", async () => {
    const { f } = rotearFetch({
      "/123456": {
        status: 400,
        corpo: {
          error: { code: 190, message: "Error validating access token: Session has expired" },
        },
      },
    });
    vi.stubGlobal("fetch", f);
    const { db } = criarDb({
      tabelas: {
        wa_phone_numbers: { account_id: "acc1" },
        wa_accounts: { id: "acc1", waba_id: "W" },
        wa_credentials: { access_token_enc: cifrarToken("T", chave) },
      },
    });
    const r = await lerSaudeDaConexao(db, "emp", "123456");
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.texto).toContain("expirou");
  });
});
