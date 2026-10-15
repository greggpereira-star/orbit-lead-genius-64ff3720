import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * `/api/public/quiz-completed` é pública e envia WhatsApp com o número da
 * empresa. Aceitar `telefone` do corpo a tornava um disparador para qualquer
 * número e qualquer texto, sem limite.
 */
const rota = readFileSync("src/routes/api/public/quiz-completed.ts", "utf8");
const envio = rota.slice(rota.indexOf("const destino"));

describe("quiz-completed não é um relé de WhatsApp", () => {
  it("o número vem do lead da sessão, nunca do corpo", () => {
    expect(rota).toContain("const destino = leadDoQuiz?.phone?.trim() || '';");
    expect(rota).toContain("canal.provider.sendText(canal.canal, numero, texto)");
    expect(rota).toContain("const numero = toWhatsAppNumber(destino);");
    expect(rota).not.toMatch(/sendText\([^)]*body\.telefone/);
  });

  it("quem pediu para parar não recebe a mensagem da faixa", () => {
    expect(rota).toContain("numeroEmOptout(supabaseAdmin as never, q.company_id, numero)");
  });

  it("sem lead resolvido não há envio", () => {
    expect(envio).toMatch(/if \(!faixa\.whatsappTemplate\?\.trim\(\) \|\| !destino\)/);
  });

  it("uma mensagem por lead a cada 24h, reclamada de forma atômica antes do envio", () => {
    expect(envio).toContain("24 * 60 * 60 * 1000");
    expect(envio).toContain("quiz_tier_sent_at");
    const reclame = envio.indexOf(".is('metadata->>quiz_tier_sent_at'");
    expect(reclame).toBeGreaterThan(-1);
    // o reclame vem ANTES do envio pelo provedor
    expect(reclame).toBeLessThan(envio.indexOf("canal.provider.sendText("));
  });

  it("falha de envio devolve a reserva", () => {
    expect((envio.match(/await liberar\(\)/g) ?? []).length).toBe(4);
  });
});
