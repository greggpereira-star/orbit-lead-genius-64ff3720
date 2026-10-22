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
