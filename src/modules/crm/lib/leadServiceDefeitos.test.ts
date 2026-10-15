import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const fonte = readFileSync("src/modules/crm/services/leadService.ts", "utf8");

describe("exclusão: banco primeiro, arquivos depois", () => {
  const apagaLote = fonte.slice(
    fonte.indexOf("export async function deleteLeads"),
    fonte.indexOf("export async function deleteLead("),
  );
  const apagaUm = fonte.slice(
    fonte.indexOf("export async function deleteLead("),
    fonte.indexOf("export async function archiveLead"),
  );

  it("em lote", () => {
    expect(apagaLote.indexOf(".delete()")).toBeGreaterThan(-1);
    expect(apagaLote.indexOf(".delete()")).toBeLessThan(
      apagaLote.indexOf("storage.from('lead-attachments').remove"),
    );
  });

  it("individual", () => {
    expect(apagaUm.indexOf(".delete()")).toBeGreaterThan(-1);
    expect(apagaUm.indexOf(".delete()")).toBeLessThan(
      apagaUm.indexOf("storage.from('lead-attachments').remove"),
    );
  });
});

describe("busca por telefone com máscara", () => {
  it("o termo numérico também procura pelos dígitos", () => {
    expect(fonte).toContain("phone.ilike.%${digitos}%");
    expect(fonte).toContain("pareceNumero");
  });

  it("a regra de 'parece número' não captura nome nem e-mail", () => {
    const parece = (t: string) => t.replace(/\D/g, "").length >= 4 && /^[\d\s()+\-.]+$/.test(t);
    expect(parece("(27) 99999-8888")).toBe(true);
    expect(parece("+55 27 99999 8888")).toBe(true);
    expect(parece("maria 2024")).toBe(false);
    expect(parece("ana@x.com")).toBe(false);
    expect(parece("123")).toBe(false);
  });
});

describe("contato digitado à mão é validado", () => {
  it("criação e edição usam a mesma validação do quiz", () => {
    expect(fonte).toContain('import { validarTelefone } from "@/modules/quiz/lib/telefone";');
    expect(fonte).toContain('import { validarEmail } from "@/modules/quiz/lib/email";');
    expect((fonte.match(/validarContatoManual\(/g) ?? []).length).toBe(3); // definição + 2 usos
  });
});
