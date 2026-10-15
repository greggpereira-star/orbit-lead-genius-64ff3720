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
    expect(rota).toContain("sendText(instanceNameFor(q.company_id), destino, texto)");
    expect(rota).not.toMatch(/sendText\([^)]*body\.telefone/);
  });

  it("sem lead resolvido não há envio", () => {
    expect(envio).toMatch(/if \(!faixa\.whatsappTemplate\?\.trim\(\) \|\| !destino\)/);
  });

  it("uma mensagem por lead a cada 24h, reclamada de forma atômica antes do envio", () => {
    expect(envio).toContain("24 * 60 * 60 * 1000");
    expect(envio).toContain("quiz_tier_sent_at");
    // o reclame condicional vem ANTES do sendText
    expect(envio.indexOf(".is('metadata->>quiz_tier_sent_at'")).toBeGreaterThan(-1);
    expect(envio.indexOf(".is('metadata->>quiz_tier_sent_at'")).toBeLessThan(
      envio.indexOf("await sendText") === -1
        ? envio.indexOf("sendText(")
        : envio.indexOf("await sendText"),
    );
  });

  it("falha de envio devolve a reserva", () => {
    expect((envio.match(/await liberar\(\)/g) ?? []).length).toBe(2);
  });
});
