import { describe, expect, it } from "vitest";
import { interpretarValidadeDoToken } from "./validadeDoToken";

const AGORA = Date.parse("2026-10-22T12:00:00Z");
const em = (dias: number) => Math.floor((AGORA + dias * 86_400_000) / 1000);

describe("interpretarValidadeDoToken", () => {
  it("expires_at 0 = não expira", () => {
    const v = interpretarValidadeDoToken({ data: { is_valid: true, expires_at: 0 } }, AGORA);
    expect(v.nivel).toBe("ok");
    expect(v.expiraEm).toBeNull();
  });
  it("válido com data distante", () => {
    const v = interpretarValidadeDoToken({ data: { is_valid: true, expires_at: em(40) } }, AGORA);
    expect(v.nivel).toBe("ok");
    expect(v.descricao).toContain("40 dias");
  });
  it("avisa quando faltam 7 dias ou menos", () => {
    const v = interpretarValidadeDoToken({ data: { is_valid: true, expires_at: em(3) } }, AGORA);
    expect(v.nivel).toBe("vence_logo");
    expect(v.rotulo).toBe("Vence em 3 dias");
  });
  it("inválido = expirado/revogado, com a data se houver", () => {
    const v = interpretarValidadeDoToken({ data: { is_valid: false, expires_at: em(-2) } }, AGORA);
    expect(v.nivel).toBe("expirado");
    expect(v.descricao).toContain("Gere um token novo");
  });
  it("sem is_valid, não chuta", () => {
    expect(interpretarValidadeDoToken({}, AGORA).nivel).toBe("desconhecido");
    expect(interpretarValidadeDoToken(null, AGORA).nivel).toBe("desconhecido");
  });
});

describe("escopos do token", () => {
  it("aponta as permissões obrigatórias que faltam", () => {
    const v = interpretarValidadeDoToken(
      {
        data: {
          is_valid: true,
          expires_at: 0,
          scopes: ["whatsapp_business_management", "ads_read"],
        },
      },
      AGORA,
    );
    expect(v.escoposFaltando).toEqual(["whatsapp_business_messaging"]);
    expect(v.escopos).toContain("ads_read");
  });
  it("com as duas, não falta nada", () => {
    const v = interpretarValidadeDoToken(
      {
        data: {
          is_valid: true,
          expires_at: 0,
          scopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
        },
      },
      AGORA,
    );
    expect(v.escoposFaltando).toEqual([]);
  });
  it("sem escopos informados não acusa falta (não dá para saber)", () => {
    const v = interpretarValidadeDoToken({ data: { is_valid: true, expires_at: 0 } }, AGORA);
    expect(v.escopos).toEqual([]);
    expect(v.escoposFaltando).toEqual([]);
  });
});

describe("permissão por conta (granular_scopes)", () => {
  const WABA = "1712518090288635";
  const base = { is_valid: true, expires_at: 0 };
  it("acusa a permissão que não inclui a conta do número", () => {
    const v = interpretarValidadeDoToken(
      {
        data: {
          ...base,
          scopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
          granular_scopes: [
            { scope: "whatsapp_business_management", target_ids: [WABA] },
            { scope: "whatsapp_business_messaging", target_ids: ["999"] },
          ],
        },
      },
      AGORA,
      WABA,
    );
    expect(v.escoposSemAcessoAConta).toEqual(["whatsapp_business_messaging"]);
  });
  it("não acusa quando a conta está na lista, ou quando não há lista", () => {
    const comLista = interpretarValidadeDoToken(
      {
        data: {
          ...base,
          scopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
          granular_scopes: [
            { scope: "whatsapp_business_messaging", target_ids: [WABA, "1"] },
            { scope: "whatsapp_business_management", target_ids: [WABA] },
          ],
        },
      },
      AGORA,
      WABA,
    );
    expect(comLista.escoposSemAcessoAConta).toEqual([]);
    const semLista = interpretarValidadeDoToken(
      { data: { ...base, scopes: ["whatsapp_business_messaging"] } },
      AGORA,
      WABA,
    );
    expect(semLista.escoposSemAcessoAConta).toEqual([]);
  });
  it("sem o ID da conta não verifica", () => {
    const v = interpretarValidadeDoToken(
      {
        data: {
          ...base,
          granular_scopes: [{ scope: "whatsapp_business_messaging", target_ids: ["9"] }],
        },
      },
      AGORA,
    );
    expect(v.escoposSemAcessoAConta).toEqual([]);
  });
});
