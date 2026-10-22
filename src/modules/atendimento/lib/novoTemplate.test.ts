import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tela = readFileSync("src/modules/atendimento/components/NovoTemplate.tsx", "utf8");

describe("Novo template (cadastro)", () => {
  it("categoria é uma escolha com explicação (cartões), não o seletor nativo que cobria o rótulo", () => {
    expect(tela).not.toContain("<select");
    expect(tela).toContain('type="radio"');
    expect(tela).toContain("Utilidade");
    expect(tela).toContain("Marketing");
  });

  it("o botão de enviar nunca fica apagado sem explicar: mostra o que falta e leva ao campo", () => {
    expect(tela).toContain("onClick={tentarEnviar}");
    expect(tela).not.toContain("disabled={enviando || temErro");
    expect(tela).toContain("Antes de enviar");
    expect(tela).toContain("Falta:");
    expect(tela).toContain("document.getElementById(alvo)?.focus()");
  });

  it("erro aparece junto do campo (e só depois de escrever ou de tentar enviar)", () => {
    for (const campo of ["nome", "corpo", "exemplos", "cabecalho", "rodape", "botoes"])
      expect(tela).toContain(`doCampo("${campo}")`);
    expect(tela).toContain("tentou || temConteudo(campo)");
  });

  it("opcionais só aparecem quando adicionados, e o nome é corrigido enquanto digita", () => {
    expect(tela).toContain("fechadas");
    expect(tela).toContain("normalizarNomeDoTemplate(e.target.value)");
    for (const rotulo of ["Cabeçalho", "Rodapé", "Botões"]) expect(tela).toContain(rotulo);
  });

  it("mantém o fluxo de rascunho e de envio com a conta escolhida", () => {
    expect(tela).toContain("...(rascunhoId ? { rascunhoId } : {})");
    expect(tela).toContain("...(accountId ? { accountId } : {})");
    expect(tela).toContain("Salvar rascunho");
    expect(tela).toContain("Enviar para análise");
  });

  it("são 3 passos de navegação livre, e só o último tem o botão de enviar", () => {
    for (const r of ["Identificação", "Mensagem", "Extras e revisão"]) expect(tela).toContain(r);
    expect(tela).toContain("onClick={() => irPara(i)}");
    expect(tela).toContain('aria-label="Passos do cadastro"');
    expect(tela).toContain("passo < PASSOS.length - 1");
    expect(tela).toContain("Próximo:");
    // o modal não rola em tela larga: altura fixa, e a rolagem só como rede de segurança dentro da coluna
    expect(tela).toContain("h-[min(780px,92dvh)]");
    expect(tela).toContain("overflow-hidden p-0");
  });

  it("o passo da mensagem mostra variáveis com exemplo ao lado do editor e oferece modelos", () => {
    expect(tela).toContain("Variáveis e exemplos");
    expect(tela).toContain("Inserir variável");
    expect(tela).toContain("MODELOS_DE_TEMPLATE");
    expect(tela).toContain("Começar de um modelo");
    expect(tela).toContain("Trocar o texto atual pelo modelo?");
  });

  it("enviar com pendência leva ao passo e ao campo certo", () => {
    expect(tela).toContain("irPara(destino)");
    expect(tela).toContain("t-nome");
    expect(tela).toContain("t-corpo");
  });
});
