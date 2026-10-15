import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  avaliarProntidaoDoCorte,
  confirmacaoConfere,
  FRASE_DO_CORTE,
  type FatosDoCorte,
} from "./corte";

const pronto: FatosDoCorte = {
  numeroAtivo: true,
  webhookInscrito: true,
  recebidasNaSemana: 3,
  entreguesNaSemana: 2,
  templatesAprovados: 1,
  legadoLigado: false,
  regrasComTextoLivre: 0,
  temInstanciaEvolution: true,
  ambienteCompleto: true,
};

describe("avaliarProntidaoDoCorte", () => {
  it("tudo em ordem libera", () => {
    const r = avaliarProntidaoDoCorte(pronto);
    expect(r.pronto).toBe(true);
    expect(r.itens.every((i) => i.ok)).toBe(true);
  });

  it.each([
    ["ambienteCompleto", { ambienteCompleto: false }],
    ["numeroAtivo", { numeroAtivo: false }],
    ["webhookInscrito", { webhookInscrito: false }],
    ["recebidasNaSemana", { recebidasNaSemana: 0 }],
    ["entreguesNaSemana", { entreguesNaSemana: 0 }],
    ["templatesAprovados", { templatesAprovados: 0 }],
  ] as const)("BLOQUEIA sem %s", (_n, alt) => {
    const r = avaliarProntidaoDoCorte({ ...pronto, ...alt });
    expect(r.pronto).toBe(false);
    expect(r.itens.some((i) => i.bloqueante && !i.ok)).toBe(true);
  });

  it("sem instância da Evolution não há o que cortar", () => {
    expect(avaliarProntidaoDoCorte({ ...pronto, temInstanciaEvolution: false }).pronto).toBe(false);
  });

  it("legado ligado e regra de texto livre AVISAM, mas não bloqueiam", () => {
    const r = avaliarProntidaoDoCorte({ ...pronto, legadoLigado: true, regrasComTextoLivre: 2 });
    expect(r.pronto).toBe(true);
    const avisos = r.itens.filter((i) => !i.ok);
    expect(avisos.map((a) => a.id).sort()).toEqual(["legado", "texto_livre"]);
    expect(avisos.every((a) => !a.bloqueante)).toBe(true);
  });

  it("todo item que falha diz o que fazer", () => {
    const r = avaliarProntidaoDoCorte({
      ...pronto,
      ambienteCompleto: false,
      numeroAtivo: false,
      webhookInscrito: false,
      recebidasNaSemana: 0,
      entreguesNaSemana: 0,
      templatesAprovados: 0,
      legadoLigado: true,
      regrasComTextoLivre: 1,
    });
    for (const i of r.itens.filter((x) => !x.ok)) expect(i.acao, i.id).toBeTruthy();
  });
});

describe("confirmação do corte", () => {
  it("exige a frase exata (espaços nas pontas não contam, caixa conta)", () => {
    expect(confirmacaoConfere(FRASE_DO_CORTE)).toBe(true);
    expect(confirmacaoConfere(`  ${FRASE_DO_CORTE}  `)).toBe(true);
    expect(confirmacaoConfere(FRASE_DO_CORTE.toLowerCase())).toBe(false);
    expect(confirmacaoConfere("CORTAR")).toBe(false);
    expect(confirmacaoConfere("")).toBe(false);
  });
});

describe("server functions — papéis e posse", () => {
  const f = readFileSync("src/lib/whatsapp-atendimento.functions.ts", "utf8");
  const papeis = readFileSync("src/lib/whatsapp/papeis.ts", "utf8");
  const corpo = (nome: string) => {
    const i = f.indexOf(`export const ${nome}`);
    const j = f.indexOf("export const ", i + 10);
    return f.slice(i, j === -1 ? f.length : j);
  };

  it("viewer não atende: toda escrita de atendimento exige papel de atendimento", () => {
    for (const n of [
      "enviarMensagemWhatsApp",
      "enviarTemplateWhatsApp",
      "atribuirConversaWhatsApp",
      "alterarStatusConversaWhatsApp",
      "prepararUploadDeMidiaWhatsApp",
      "enviarMidiaWhatsApp",
      "criarNotaWhatsApp",
    ]) {
      expect(corpo(n), n).toContain("empresaParaAtender(admin, context.userId)");
      expect(corpo(n), n).not.toContain("empresaDoUsuario(admin, context.userId)");
    }
    // a regra mora no helper compartilhado (papel desconhecido vale como o menor)
    expect(papeis).toMatch(/if \(!podeAtender\(role\)\)\s*throw new Error\(/);
    expect(papeis).toContain(
      'const ATENDEM: ReadonlySet<string> = new Set(["owner", "admin", "member"])',
    );
  });

  it("o corte só para dono/administrador, e reavalia no servidor", () => {
    const c = corpo("executarCorteEvolutionWhatsApp");
    expect(c).toContain("empresaParaAdministrar(admin, context.userId)");
    expect(papeis).toContain(
      'const ADMINISTRAM: ReadonlySet<string> = new Set(["owner", "admin"])',
    );
    expect(papeis).toMatch(/if \(!podeAdministrar\(role\)\)\s*throw new Error\(/);
    expect(c.indexOf("confirmacaoConfere(")).toBeLessThan(c.indexOf("coletarFatosDoCorte("));
    expect(c.indexOf("avaliarProntidaoDoCorte(fatos)")).toBeLessThan(c.indexOf("deleteInstance("));
  });

  it("o corte desliga o legado ANTES de remover a sessão", () => {
    const c = corpo("executarCorteEvolutionWhatsApp");
    expect(c.indexOf("greeting_enabled: false")).toBeGreaterThan(-1);
    expect(c.indexOf("greeting_enabled: false")).toBeLessThan(c.indexOf("deleteInstance("));
  });

  it("mídia: o caminho do navegador é conferido contra a empresa da sessão", () => {
    const c = corpo("enviarMidiaWhatsApp");
    expect(c).toContain("caminhoEhDaEmpresa(data.caminho, companyId)");
    expect(c.indexOf("caminhoEhDaEmpresa(")).toBeLessThan(c.indexOf("enviarMidiaNaConversa("));
  });

  it("mídia: mensagem de outra empresa é 'inexistente'", () => {
    const c = corpo("obterMidiaWhatsApp");
    expect(c).toContain("m.company_id !== companyId");
  });

  it("leitura continua aberta ao viewer (listar, ver mídia, avaliar)", () => {
    expect(corpo("obterMidiaWhatsApp")).toContain("empresaDoUsuario(admin, context.userId)");
    expect(corpo("avaliarCorteWhatsApp")).toContain("empresaDoUsuario(admin, context.userId)");
  });
});
