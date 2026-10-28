import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CAMPOS_PUBLICOS_DO_LEAD,
  atualizarLeadSchema,
  codificarCursor,
  criarLeadSchema,
  decodificarCursor,
  filtroDoCursor,
  limiteDaPagina,
  serializarLead,
} from "./leads";

describe("formato do lead na API", () => {
  it("é igual ao de public.lead_para_api (webhook e API não podem divergir)", () => {
    const sql = readFileSync(
      "supabase/migrations/20261102100000_api_publica_e_webhooks.sql",
      "utf8",
    );
    const corpo = sql.slice(
      sql.indexOf("FUNCTION public.lead_para_api"),
      sql.indexOf("REVOKE ALL ON FUNCTION public.lead_para_api"),
    );
    const noSql = [...corpo.matchAll(/'([a-z_]+)',\s*p_lead\.([a-z_]+)/g)].map((m) => {
      expect(m[1]).toBe(m[2]); // a chave do JSON é o nome da coluna
      return m[1];
    });
    expect([...noSql].sort()).toEqual([...CAMPOS_PUBLICOS_DO_LEAD].sort());
  });

  it("não expõe identificadores de anúncio nem dados internos", () => {
    for (const proibido of [
      "gclid",
      "fbclid",
      "wbraid",
      "gbraid",
      "metadata",
      "device_info",
      "location_info",
      "assigned_to",
      "cvcrm_id",
      "company_id",
    ]) {
      expect(CAMPOS_PUBLICOS_DO_LEAD).not.toContain(proibido);
    }
  });

  it("serializa só os campos públicos e devolve deal_value como número", () => {
    const s = serializarLead({
      id: "x",
      name: "Ana",
      deal_value: "1500.50",
      gclid: "SEGREDO",
      company_id: "c",
    });
    expect(s.deal_value).toBe(1500.5);
    expect(s).not.toHaveProperty("gclid");
    expect(s).not.toHaveProperty("company_id");
    expect(Object.keys(s)).toEqual([...CAMPOS_PUBLICOS_DO_LEAD]);
    expect(s.email).toBeNull(); // ausente vira null, não some
  });
});

describe("criar lead", () => {
  it("exige ao menos nome, e-mail ou telefone", () => {
    expect(criarLeadSchema.safeParse({}).success).toBe(false);
    expect(criarLeadSchema.safeParse({ city: "Vitória" }).success).toBe(false);
    expect(criarLeadSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });
  it("recusa campo desconhecido em vez de ignorar", () => {
    const r = criarLeadSchema.safeParse({ name: "Ana", nome: "Ana" });
    expect(r.success).toBe(false);
  });
  it("não deixa gravar campo interno (gclid, company_id, assigned_to)", () => {
    for (const k of ["gclid", "company_id", "assigned_to", "score", "status", "id"]) {
      expect(criarLeadSchema.safeParse({ name: "Ana", [k]: "x" }).success).toBe(false);
    }
  });
  it("normaliza e valida e-mail e moeda; recusa telefone inválido", () => {
    const r = criarLeadSchema.parse({ email: " ANA@Exemplo.COM ", deal_currency: "brl" });
    expect(r.email).toBe("ana@exemplo.com");
    expect(r.deal_currency).toBe("BRL");
    expect(criarLeadSchema.safeParse({ phone: "123" }).success).toBe(false);
    expect(criarLeadSchema.safeParse({ phone: "(27) 99999-1234" }).success).toBe(true);
  });
  it("custom_fields: chave minúscula e valor simples", () => {
    expect(criarLeadSchema.safeParse({ name: "A", custom_fields: { Cargo: "x" } }).success).toBe(
      false,
    );
    expect(
      criarLeadSchema.safeParse({ name: "A", custom_fields: { cargo: { a: 1 } } }).success,
    ).toBe(false);
    expect(
      criarLeadSchema.safeParse({ name: "A", custom_fields: { cargo: "Dono", faturamento: 1000 } })
        .success,
    ).toBe(true);
  });
  it("valor negativo não passa", () => {
    expect(criarLeadSchema.safeParse({ name: "A", deal_value: -1 }).success).toBe(false);
  });
});

describe("atualizar lead", () => {
  it("corpo vazio é erro; null limpa o campo", () => {
    expect(atualizarLeadSchema.safeParse({}).success).toBe(false);
    expect(atualizarLeadSchema.parse({ city: null })).toEqual({ city: null });
  });
  it("não permite trocar origem/UTM/dono por aqui", () => {
    for (const k of ["source", "utm_source", "assigned_to", "company_id", "status"]) {
      expect(atualizarLeadSchema.safeParse({ [k]: "x" }).success).toBe(false);
    }
  });
});

describe("paginação", () => {
  const id = "123e4567-e89b-12d3-a456-426614174000";
  it("cursor vai e volta", () => {
    const c = { criadoEm: "2026-11-01T10:00:00.000Z", id };
    expect(decodificarCursor(codificarCursor(c))).toEqual(c);
  });
  it("cursor adulterado vira null, nunca SQL", () => {
    expect(decodificarCursor("lixo")).toBeNull();
    expect(
      decodificarCursor(Buffer.from("2026-11-01T10:00:00Z|1) or true --").toString("base64url")),
    ).toBeNull();
    expect(decodificarCursor(Buffer.from(`nao-e-data|${id}`).toString("base64url"))).toBeNull();
    // O V8 aceita texto entre parênteses em Date.parse; o filtro não pode ver isso.
    const injecao = `1 Jan 2026 (,id.gt.0)|${id}`;
    expect(Number.isNaN(Date.parse("1 Jan 2026 (,id.gt.0)"))).toBe(false);
    expect(decodificarCursor(Buffer.from(injecao).toString("base64url"))).toBeNull();
    const c = { criadoEm: "2026-10-28T10:47:47.616772+00:00", id };
    expect(decodificarCursor(codificarCursor(c))).toEqual(c); // microssegundos preservados
    expect(filtroDoCursor(c)).toBe(
      `created_at.lt.${c.criadoEm},and(created_at.eq.${c.criadoEm},id.lt.${id})`,
    );
  });
  it("limite: padrão 50, máximo 100, o resto é recusado", () => {
    expect(limiteDaPagina(undefined)).toBe(50);
    expect(limiteDaPagina("100")).toBe(100);
    expect(limiteDaPagina("101")).toBeNull();
    expect(limiteDaPagina("0")).toBeNull();
    expect(limiteDaPagina("10; drop")).toBeNull();
  });
});
