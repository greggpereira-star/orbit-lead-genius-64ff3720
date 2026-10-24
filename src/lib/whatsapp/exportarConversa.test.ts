import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { celulaCsv, conversaParaCsv, nomeDoArquivoDeExportacao } from "./exportarConversa";
import type { MensagemDaConversa } from "../../modules/atendimento/lib/mensagens";

const m = (over: Partial<MensagemDaConversa>): MensagemDaConversa => ({
  id: "1",
  direction: "inbound",
  origin: "customer",
  type: "text",
  body: "oi",
  status: "received",
  provider_ts: "2026-10-16T12:00:00Z",
  created_at: "2026-10-16T12:00:01Z",
  template_name: null,
  sent_by: null,
  error_title: null,
  media_id: null,
  ...over,
});

describe("celulaCsv", () => {
  it("neutraliza fórmula: planilha executaria =, +, -, @", () => {
    for (const f of ['=HYPERLINK("x")', "+55 27 9", "-1+1", "@SOMA(A1)"])
      expect(celulaCsv(f).replace(/^"/, "").startsWith("'")).toBe(true);
  });

  it("escapa aspas, ponto e vírgula e quebra de linha", () => {
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""');
    expect(celulaCsv("a;b")).toBe('"a;b"');
    expect(celulaCsv("a\nb")).toBe('"a\nb"');
    expect(celulaCsv("a\r\nb")).toBe('"a\nb"');
  });

  it("texto comum fica como está", () => {
    expect(celulaCsv("Olá tudo bem?")).toBe("Olá tudo bem?");
    // Vírgula entra entre aspas: inofensivo e seguro para quem abrir com `,` como separador.
    expect(celulaCsv("Olá, tudo bem?")).toBe('"Olá, tudo bem?"');
  });
});

describe("conversaParaCsv", () => {
  it("cabeçalho, BOM, ordem cronológica e autor só nas mensagens do atendente", () => {
    const csv = conversaParaCsv(
      [
        m({
          id: "b",
          direction: "outbound",
          origin: "agent",
          sent_by: "u1",
          body: "Posso ajudar",
          provider_ts: "2026-10-16T12:05:00Z",
          status: "read",
        }),
        m({ id: "a", body: "Quero um orçamento" }),
        m({
          id: "c",
          direction: "outbound",
          origin: "automation",
          sent_by: "u1",
          body: "Auto",
          provider_ts: "2026-10-16T12:10:00Z",
          status: "sent",
        }),
      ],
      (id) => (id === "u1" ? "Bruna" : ""),
    );
    expect(csv.startsWith("﻿data_hora;direcao;origem;autor;tipo;texto;status;template")).toBe(true);
    const linhas = csv.trim().split("\r\n").slice(1);
    expect(linhas.map((l) => l.split(";")[5])).toEqual([
      "Quero um orçamento",
      "Posso ajudar",
      "Auto",
    ]);
    expect(linhas[1].split(";")[3]).toBe("Bruna");
    expect(linhas[2].split(";")[3]).toBe(""); // automação não leva nome de pessoa
  });

  it("texto de cliente começando com = é neutralizado no arquivo", () => {
    const csv = conversaParaCsv([m({ body: "=1+1" })]);
    expect(csv).toContain("'=1+1");
    expect(csv).not.toMatch(/;=1\+1;/);
  });

  it("mídia sem legenda sai com o rótulo, não vazia", () => {
    expect(conversaParaCsv([m({ type: "image", body: null })])).toContain("[Imagem]");
  });
});

describe("nome do arquivo", () => {
  it("sem acento, sem símbolo e com a data", () => {
    expect(nomeDoArquivoDeExportacao("Ana María / Souza", new Date("2026-10-16T10:00:00Z"))).toBe(
      "Ana_Maria_Souza_2026-10-16.csv",
    );
    expect(nomeDoArquivoDeExportacao("???", new Date("2026-10-16T10:00:00Z"))).toBe(
      "conversa_2026-10-16.csv",
    );
  });
});

describe("exportar (servidor e menu)", () => {
  const server = readFileSync("src/lib/whatsapp-atendimento.functions.ts", "utf8");
  const f = server.slice(server.indexOf("export const exportarConversaWhatsApp"));

  it("confere papel e empresa e filtra as mensagens pela empresa", () => {
    expect(f).toContain("empresaParaAtender(admin, context.userId)");
    expect(f).toContain("conferirConversa(admin, companyId, data.conversaId, context.userId)");
    expect(f).toContain('.eq("company_id", companyId)');
  });

  it("não inclui notas internas e tem teto", () => {
    expect(f).not.toContain("wa_notes");
    expect(f).toContain("TETO_DA_EXPORTACAO");
  });

  it("o menu oferece a exportação", () => {
    const menu = readFileSync("src/modules/atendimento/components/MenuDaConversa.tsx", "utf8");
    expect(menu).toContain("Exportar conversa (CSV)");
  });
});
