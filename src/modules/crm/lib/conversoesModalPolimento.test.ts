import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tabela = readFileSync("src/modules/crm/components/ConversionSettingsTable.tsx", "utf8");
const dialogo = readFileSync("src/modules/crm/components/StageManagerDialog.tsx", "utf8");

describe("modal de conversões — correções de comportamento", () => {
  it("desligar o modo de ensaio pede confirmação; ligar não", () => {
    expect(tabela).toContain(
      "aoTrocar={(v) => (v ? trocarEnsaio.mutate(true) : setConfirmandoAoVivo(true))}",
    );
    expect(tabela).toContain("Enviar conversões de verdade?");
    expect(tabela).toContain("onClick={() => trocarEnsaio.mutate(false)}");
    // a mutação que desliga só existe dentro da confirmação
    expect(tabela.match(/trocarEnsaio\.mutate\(false\)/g)).toHaveLength(1);
  });

  it("cabeçalho das colunas fica preso ao topo da rolagem", () => {
    expect(tabela).toMatch(/sticky top-0 z-10 hidden items-end/);
  });

  it("campos de texto são controlados (o primeiro clique em Salvar não se perde)", () => {
    // nenhum campo desta tabela confirma o valor só ao sair dele
    expect(tabela).not.toContain("onBlur");
    expect(tabela).not.toContain("defaultValue");
    expect(tabela).toContain("onChange={(e) => aoMudar({ etiquetaCrm: e.target.value || null })}");
  });

  it("etiqueta do CRM repetida bloqueia o Salvar antes de gravar parte do lote", () => {
    expect(tabela).toContain("erroCrmPorEtapa");
    expect(tabela).toContain("disabled={!sujo || temErro || gravar.isPending}");
  });

  it("a coluna do WhatsApp some quando o canal não existe e usa grade sem ela", () => {
    expect(tabela).toContain("GRADE_SEM_WHATSAPP");
    expect(tabela).toContain("const mostrarWhatsapp = etiquetas.data !== undefined");
    expect(tabela).toContain("{mostrarWhatsapp && ");
    expect(tabela).toContain("Mostrar mesmo assim");
  });

  it("ordem de eventos errada marca a linha, não só o painel", () => {
    expect(tabela).toContain("foraDeOrdemIds");
    expect(tabela).toContain("Evento mais raso que o de uma etapa anterior");
  });

  it("painel de apoio fica à vista enquanto a lista rola", () => {
    expect(tabela).toContain("xl:sticky xl:top-0");
  });
});

describe("diálogo de etapas — não perde alteração em silêncio", () => {
  it("fechar com alteração de conversão pendente pergunta antes", () => {
    expect(dialogo).toContain("onSujoChange={setConversoesSujas}");
    expect(dialogo).toContain("<Dialog open={open} onOpenChange={tentarFechar}>");
    expect(dialogo).toContain("!aberto\n      && conversoesSujas");
  });
  it("os três números viram uma faixa só (sem três cartões iguais)", () => {
    expect(dialogo).toContain('<dl className="hidden items-stretch');
    expect(dialogo).toContain("sm:flex");
    expect(dialogo).not.toContain("icone={<Layers");
  });
});
