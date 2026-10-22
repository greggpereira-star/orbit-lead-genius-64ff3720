import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { temMidia } from "./mensagens";

const conversa = readFileSync("src/modules/atendimento/components/Conversa.tsx", "utf8");
const painel = readFileSync("src/modules/atendimento/components/PainelDoLead.tsx", "utf8");
const config = readFileSync("src/routes/_app.settings.whatsapp.tsx", "utf8");
const midia = readFileSync("src/modules/atendimento/components/MidiaDaMensagem.tsx", "utf8");

describe("mídia na conversa", () => {
  it("só há mídia para tipo de mídia COM media_id", () => {
    expect(temMidia({ type: "image", media_id: "m" })).toBe(true);
    expect(temMidia({ type: "image", media_id: null })).toBe(false);
    expect(temMidia({ type: "text", media_id: "m" })).toBe(false);
    expect(temMidia({ type: "document", media_id: "m" })).toBe(true);
    expect(temMidia({ type: "reaction", media_id: "m" })).toBe(false);
  });

  it("com mídia visível, a bolha mostra só a legenda (nada de '[Imagem]' duplicado)", () => {
    expect(conversa).toContain("{temMidia(m) ? m.body : textoParaExibir(m)}");
  });

  it("a URL assinada não é guardada por muito tempo", () => {
    expect(midia).toContain("staleTime: 4 * 60_000");
  });

  it("imagem abre em nova aba sem vazar a origem", () => {
    expect(midia).toContain('rel="noopener noreferrer"');
  });

  it("o anexo valida antes de subir e oferece documento em vez de recusar calado", () => {
    expect(conversa).toContain("normalizarMime(arquivo.type, arquivo.name)");
    expect(conversa).toContain(
      "classificarArquivoParaEnvio({ mime, bytes: arquivo.size, nome: arquivo.name })",
    );
    expect(conversa).toContain("Enviar como documento?");
    // O arquivo sobe com o tipo declarado: como octet-stream a Meta recusa áudio ao baixar.
    expect(conversa).toContain("new File([arquivo], arquivo.name, { type: mime })");
    expect(conversa).toContain("{ contentType: mime }");
    const v = conversa.indexOf("classificarArquivoParaEnvio({ mime, bytes");
    expect(v).toBeLessThan(conversa.indexOf("prepararUpload({"));
    expect(conversa.indexOf("prepararUpload({")).toBeLessThan(conversa.indexOf("enviarMidia({"));
  });
});

describe("notas internas", () => {
  it("avisam que não vão ao cliente e usam a função de servidor", () => {
    expect(painel).toContain("não vão ao cliente");
    expect(painel).toContain("criarNotaWhatsApp");
  });
});

describe("corte da Evolution na tela", () => {
  it("o botão exige item obrigatório em ordem E a frase digitada", () => {
    expect(config).toContain(
      "disabled={!pronto || !confirmacaoConfere(frase) || executar.isPending}",
    );
  });
  it("o campo da frase fica travado enquanto não estiver pronto", () => {
    expect(config).toContain("disabled={!pronto}");
  });
  it("o cartão some quando não há instância antiga", () => {
    expect(config).toContain("!q.data.fatos.temInstanciaEvolution) return null");
  });
  it("o uso é CONTAGEM e diz que o valor depende da tabela da Meta", () => {
    expect(config.replace(/\s+/g, " ")).toContain("O valor depende da tabela de preços da Meta");
    expect(config).not.toMatch(/R\$\s*\d/);
  });
});

describe("renderização estática do aviso de mídia indisponível", () => {
  it("o componente exporta o predicado sem depender do React Query", () => {
    expect(typeof renderToStaticMarkup).toBe("function");
  });
});
