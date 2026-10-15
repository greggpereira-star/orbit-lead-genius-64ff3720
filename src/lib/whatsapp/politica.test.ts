import { describe, it, expect } from "vitest";
import {
  decidirEnvio,
  dentroDaJanela,
  horaEmSaoPaulo,
  numeroEmOptout,
  janelaDaEmpresa,
  JANELA_PADRAO,
} from "./politica";
import { toWhatsAppNumber, variantesDoNumero } from "./numero";
import type { AdminDb } from "./provider";

const janela = { inicio: 8, fim: 21 };

describe("dentroDaJanela", () => {
  it("janela comum", () => {
    expect(dentroDaJanela(8, janela)).toBe(true);
    expect(dentroDaJanela(20, janela)).toBe(true);
    expect(dentroDaJanela(21, janela)).toBe(false); // fim é exclusivo
    expect(dentroDaJanela(7, janela)).toBe(false);
  });
  it("janela que cruza a meia-noite", () => {
    const noite = { inicio: 20, fim: 6 };
    expect(dentroDaJanela(23, noite)).toBe(true);
    expect(dentroDaJanela(3, noite)).toBe(true);
    expect(dentroDaJanela(12, noite)).toBe(false);
  });
  it("início = fim significa sem restrição", () => {
    expect(dentroDaJanela(3, { inicio: 0, fim: 0 })).toBe(true);
  });
});

describe("horaEmSaoPaulo", () => {
  it("converte do UTC para o horário do lead", () => {
    expect(horaEmSaoPaulo(new Date("2026-10-15T15:00:00Z"))).toBe(12);
    expect(horaEmSaoPaulo(new Date("2026-10-15T01:30:00Z"))).toBe(22);
  });
});

describe("decidirEnvio", () => {
  const base = { numero: "5527996318075", optedOut: false, hora: 12, janela };

  it("tudo em ordem envia", () => {
    expect(decidirEnvio(base)).toEqual({ enviar: true });
  });

  it("opt-out bloqueia — mesmo dentro do horário", () => {
    const d = decidirEnvio({ ...base, optedOut: true });
    expect(d).toMatchObject({ enviar: false, motivo: "opt_out" });
  });

  it("opt-out vence o horário: cancelar, e não adiar", () => {
    const d = decidirEnvio({ ...base, optedOut: true, hora: 3 });
    expect(d).toMatchObject({ enviar: false, motivo: "opt_out" });
  });

  it("fora do horário bloqueia e diz a janela", () => {
    const d = decidirEnvio({ ...base, hora: 23 });
    expect(d).toMatchObject({ enviar: false, motivo: "fora_do_horario" });
    expect((d as { texto: string }).texto).toContain("8h–21h");
  });

  it("sem janela configurada não restringe horário", () => {
    expect(decidirEnvio({ ...base, hora: 3, janela: null })).toEqual({ enviar: true });
  });

  it("número inválido bloqueia antes de tudo", () => {
    expect(decidirEnvio({ ...base, numero: null })).toMatchObject({ motivo: "numero_invalido" });
  });
});

describe("variantes do nono dígito (o opt-out não pode escapar por formato)", () => {
  it("celular com 9 também procura sem o 9, e vice-versa", () => {
    expect(variantesDoNumero("5527996318075").sort()).toEqual(
      ["552796318075", "5527996318075"].sort(),
    );
    expect(variantesDoNumero("552796318075").sort()).toEqual(
      ["552796318075", "5527996318075"].sort(),
    );
  });
  it("fixo (8 dígitos começando em 2–5) não ganha variante de celular", () => {
    expect(variantesDoNumero("552733334444")).toEqual(["552733334444"]);
  });
  it("celular antigo de 8 dígitos (começa em 6–9) ganha o 9", () => {
    expect(variantesDoNumero("552796318075".replace("2796318075", "27" + "96318075"))).toContain(
      "5527996318075",
    );
  });
});

describe("toWhatsAppNumber", () => {
  it.each([
    ["(27) 99631-8075", "5527996318075"],
    ["+55 27 99631-8075", "5527996318075"],
    ["027996318075", "5527996318075"],
    ["abc", null],
    ["123", null],
  ])("%s", (entrada, saida) => {
    expect(toWhatsAppNumber(entrada)).toBe(saida);
  });
});

/** Admin de mentira com a forma `from().select().eq().in().limit()`. */
function adminCom(
  resposta: { data?: unknown; error?: unknown },
  capturar?: (q: unknown[]) => void,
) {
  const chamadas: unknown[] = [];
  type Q = {
    select: () => Q;
    eq: (...a: unknown[]) => Q;
    in: (...a: unknown[]) => Q;
    limit: () => Promise<unknown>;
    maybeSingle: () => Promise<unknown>;
  };
  const q: Q = {
    select: () => q,
    eq: (...a: unknown[]) => (chamadas.push(["eq", ...a]), q),
    in: (...a: unknown[]) => (chamadas.push(["in", ...a]), q),
    limit: () => {
      capturar?.(chamadas);
      return Promise.resolve(resposta);
    },
    maybeSingle: () => Promise.resolve(resposta),
  };
  return { from: () => q };
}

describe("numeroEmOptout", () => {
  it("achou → true; e consulta TODAS as variantes", async () => {
    let vistas: unknown[] = [];
    const admin = adminCom({ data: [{ phone: "552796318075" }] }, (c) => (vistas = c));
    expect(await numeroEmOptout(admin, "emp", "5527996318075")).toBe(true);
    const inn = (vistas as unknown[][]).find((c) => c[0] === "in")!;
    expect(inn[2]).toEqual(expect.arrayContaining(["5527996318075", "552796318075"]));
  });

  it("não achou → false", async () => {
    expect(await numeroEmOptout(adminCom({ data: [] }), "emp", "5527996318075")).toBe(false);
  });

  it("erro de consulta BLOQUEIA: não saber não é licença para enviar", async () => {
    expect(
      await numeroEmOptout(
        adminCom({ data: null, error: { message: "x" } }),
        "emp",
        "5527996318075",
      ),
    ).toBe(true);
  });
});

describe("janelaDaEmpresa", () => {
  it("usa a configuração da empresa", async () => {
    const a = adminCom({ data: { quiet_hours_start: 9, quiet_hours_end: 18 } });
    expect(await janelaDaEmpresa(a, "emp")).toEqual({ inicio: 9, fim: 18 });
  });
  it("sem configuração, o padrão do legado", async () => {
    expect(await janelaDaEmpresa(adminCom({ data: null }), "emp")).toEqual(JANELA_PADRAO);
  });
});
