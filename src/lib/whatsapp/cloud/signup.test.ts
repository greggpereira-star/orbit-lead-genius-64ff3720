import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { lerMensagemDoSignup, opcoesDoLogin, origemConfiavel } from "./signup";

describe("opcoesDoLogin", () => {
  it("coexistência pede o fluxo do app WhatsApp Business", () => {
    expect(opcoesDoLogin({ configId: "123", coexistencia: true })).toEqual({
      config_id: "123",
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "whatsapp_business_app_onboarding",
        sessionInfoVersion: "3",
      },
    });
  });
  it("número só da API NÃO leva featureType", () => {
    const o = opcoesDoLogin({ configId: "123", coexistencia: false });
    expect(o.extras).toEqual({ setup: {}, sessionInfoVersion: "3" });
    expect("featureType" in o.extras).toBe(false);
  });
});

describe("origemConfiavel", () => {
  it.each(["https://www.facebook.com", "https://facebook.com", "https://web.facebook.com"])(
    "%s",
    (o) => {
      expect(origemConfiavel(o)).toBe(true);
    },
  );
  it.each([
    "https://facebook.com.evil.com",
    "https://evilfacebook.com",
    "http://localhost",
    "lixo",
    "",
  ])("%s não", (o) => {
    expect(origemConfiavel(o)).toBe(false);
  });
});

describe("lerMensagemDoSignup", () => {
  const origem = "https://www.facebook.com";
  const fim = {
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    version: 3,
    data: { waba_id: "111", phone_number_id: "222" },
  };

  it("conclusão traz waba e número", () => {
    expect(lerMensagemDoSignup(origem, fim)).toEqual({
      tipo: "concluido",
      wabaId: "111",
      phoneNumberId: "222",
    });
  });
  it("aceita string JSON", () => {
    expect(lerMensagemDoSignup(origem, JSON.stringify(fim))).toMatchObject({
      tipo: "concluido",
      wabaId: "111",
    });
  });
  it("de origem estranha é ignorada — mesmo com o formato certo", () => {
    expect(lerMensagemDoSignup("https://evil.com", fim)).toEqual({ tipo: "ignorada" });
  });
  it("cancelamento e erro", () => {
    expect(
      lerMensagemDoSignup(origem, {
        type: "WA_EMBEDDED_SIGNUP",
        event: "CANCEL",
        data: { current_step: "PHONE" },
      }),
    ).toEqual({ tipo: "cancelado", etapa: "PHONE" });
    expect(
      lerMensagemDoSignup(origem, {
        type: "WA_EMBEDDED_SIGNUP",
        event: "ERROR",
        data: { error_message: "falhou" },
      }),
    ).toEqual({ tipo: "erro", texto: "falhou" });
  });
  it("conclusão sem waba_id é erro, não sucesso", () => {
    expect(
      lerMensagemDoSignup(origem, { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: {} }).tipo,
    ).toBe("erro");
  });
  it("lixo e outros tipos de mensagem são ignorados", () => {
    for (const x of [null, 42, "não é json", { type: "OUTRA" }, {}]) {
      expect(lerMensagemDoSignup(origem, x).tipo).toBe("ignorada");
    }
  });
});

describe("server functions do WhatsApp oficial", () => {
  const fonte = readFileSync("src/lib/whatsapp-cloud.functions.ts", "utf8");

  it("a empresa vem da sessão, nunca do corpo", () => {
    expect(fonte).toContain("empresaDoUsuario(admin, context.userId)");
    expect(fonte).not.toMatch(/companyId:\s*z\./);
    expect(fonte).not.toMatch(/data\.companyId/);
  });

  it("toda função exige autenticação", () => {
    const criadas = fonte.match(/createServerFn\(/g) ?? [];
    const protegidas = fonte.match(/\.middleware\(\[requireSupabaseAuth\]\)/g) ?? [];
    expect(criadas.length).toBeGreaterThan(0);
    expect(protegidas.length).toBe(criadas.length);
  });

  it("o estado devolvido não tem coluna de token", () => {
    const select = fonte.slice(
      fonte.indexOf('.from("wa_phone_numbers")'),
      fonte.indexOf('.eq("company_id", companyId),'),
    );
    expect(select).not.toMatch(/access_token|credential/);
    expect(fonte).not.toMatch(/\.from\("wa_credentials"\)/);
  });

  it("falta de WA_TOKEN_KEY impede a conexão antes de qualquer chamada à Meta", () => {
    const f = fonte.slice(fonte.indexOf("concluirSignupWhatsApp"));
    expect(f.indexOf("WA_TOKEN_KEY")).toBeGreaterThan(-1);
    expect(f.indexOf("WA_TOKEN_KEY")).toBeLessThan(f.indexOf("concluirOnboarding("));
  });
});

describe("a tela", () => {
  const tela = readFileSync("src/routes/_app.settings.whatsapp.tsx", "utf8");
  it("só reage a mensagem de origem validada (via lerMensagemDoSignup)", () => {
    expect(tela).toContain("lerMensagemDoSignup(ev.origin, ev.data)");
  });
  it("não grava nada no navegador a respeito de token", () => {
    expect(tela).not.toMatch(/localStorage|sessionStorage|access_token/);
  });
});
