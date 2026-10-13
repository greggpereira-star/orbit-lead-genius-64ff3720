import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * As telas que o visitante e o cliente novo veem falam português.
 *
 * Encontrado em 13/10 varrendo o produto: o widget de WhatsApp dizia "Speak
 * with an agent" e "Hi! How can I help you today?" para o VISITANTE de uma
 * página em português; o formulário de captura perguntava "What is your full
 * name?"; login, cadastro e recuperação de senha estavam inteiros em inglês.
 *
 * É defeito de conversão antes de ser de tradução: pedir dado a alguém num
 * idioma que ele não escolheu é atrito logo no ponto em que o lead decide se
 * preenche ou fecha.
 *
 * O marcador é só PALAVRA FUNCIONAL inglesa — artigo, pronome, preposição —
 * que não existe em português. Deliberadamente não há lista de exceções: se
 * fosse preciso isentar palavras para o teste passar, ele estaria medindo a
 * minha vontade, e não o produto. Nome de produto (WhatsApp, Pixel, CAPI) não
 * casa com nenhuma delas.
 */
const TELAS = [
  // O visitante vê estas sem nunca ter entrado no produto.
  "src/routes/index.tsx",
  "src/modules/capture/components/CaptureForm.tsx",
  "src/modules/capture/components/WhatsAppWidget.tsx",
  // Primeiro contato de quem vira cliente.
  "src/routes/_auth.login.tsx",
  "src/routes/_auth.register.tsx",
  "src/routes/_auth.forgot-password.tsx",
  "src/routes/_auth.reset-password.tsx",
  "src/routes/_auth.verify-email.tsx",
  // Erro e página inexistente aparecem para qualquer um.
  "src/routes/__root.tsx",
];

const PALAVRAS_INGLESAS = /\b(your|the|and|with|this|you|from|have|our|will|what|does|doesn't)\b/i;

/** Texto que chega aos olhos: conteúdo entre tags e rótulos de campo. */
function textoVisivel(fonte: string): string[] {
  const achados: string[] = [];
  for (const m of fonte.matchAll(/>\s*([A-Za-z][^<>{}\n]{3,120})\s*</g)) achados.push(m[1].trim());
  for (const m of fonte.matchAll(/(?:placeholder|title|aria-label|label)="([^"]{3,120})"/g)) {
    achados.push(m[1].trim());
  }
  return achados.filter(Boolean);
}

describe("telas de visitante e de entrada falam português", () => {
  it("a varredura está lendo texto de verdade", () => {
    // Guarda contra o próprio varredor: regex quebrada devolveria zero frases
    // e o teste passaria sem olhar nada.
    const total = TELAS.reduce((n, t) => n + textoVisivel(readFileSync(t, "utf8")).length, 0);
    expect(total).toBeGreaterThan(60);
  });

  for (const tela of TELAS) {
    it(`${tela.split("/").pop()}`, () => {
      const ingles = textoVisivel(readFileSync(tela, "utf8")).filter((t) =>
        PALAVRAS_INGLESAS.test(t),
      );
      expect(ingles, `em inglês: ${ingles.join(" | ")}`).toEqual([]);
    });
  }
});
