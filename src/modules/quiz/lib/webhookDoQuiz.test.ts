import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  urlDeWebhookSegura, submissaoElegivel, montarCorpoDoWebhook, type SubmissaoGravada,
} from "./webhookDoQuiz";

const sub = (o: Partial<SubmissaoGravada> = {}): SubmissaoGravada => ({
  id: "s1", quiz_id: "q1", score: 40, temperature: "hot", tags: ["A"],
  answers: { p1: "x", _contact: { email: "a@b.co", phone: "27999", name: "Ana" } },
  tracking: { utm_source: "meta" }, status: "completed",
  completed_at: new Date().toISOString(), ...o,
});

describe("urlDeWebhookSegura", () => {
  it("aceita https público", () => {
    expect(urlDeWebhookSegura("https://hooks.exemplo.com/a?x=1")).toBe("https://hooks.exemplo.com/a?x=1");
  });
  it.each([
    "http://hooks.exemplo.com/a", "https://localhost/a", "https://servidor/a", "https://127.0.0.1/a",
    "https://10.0.0.5/a", "https://172.20.1.1/a", "https://192.168.0.2/a", "https://169.254.169.254/latest",
    "https://[::1]/a", "https://a.internal/x", "https://u:p@hooks.exemplo.com/a", "ftp://x.com/a", "lixo", "", null, 42,
  ])("recusa %s", (v) => expect(urlDeWebhookSegura(v as never)).toBeNull());
});

describe("submissaoElegivel", () => {
  it("aceita concluída, do quiz certo e recente", () => expect(submissaoElegivel(sub(), "q1")).toBe(true));
  it("recusa de outro quiz", () => expect(submissaoElegivel(sub(), "q2")).toBe(false));
  it("recusa não concluída", () => expect(submissaoElegivel(sub({ status: "in_progress" }), "q1")).toBe(false));
  it("recusa antiga", () => {
    const velha = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(submissaoElegivel(sub({ completed_at: velha }), "q1")).toBe(false);
  });
  it("recusa nula", () => expect(submissaoElegivel(null, "q1")).toBe(false));
});

describe("montarCorpoDoWebhook", () => {
  it("separa o contato das respostas e mantém o formato antigo", () => {
    const c = montarCorpoDoWebhook(sub());
    expect(c.event).toBe("quiz.submission.completed");
    expect(c.contact).toEqual({ email: "a@b.co", phone: "27999", name: "Ana" });
    expect(c.responses).toEqual({ p1: "x" });
    expect(c.submission_id).toBe("s1");
  });
});

describe("o disparo mora no servidor", () => {
  const servico = readFileSync("src/modules/quiz/services/quizService.ts", "utf8");
  const rota = readFileSync("src/routes/api/public/quiz-completed.ts", "utf8");
  const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
  it("o navegador não lê nem chama webhook_url", () => {
    expect(servico).not.toContain("quizSettings.webhook_url");
    expect(servico).not.toContain("fetch(webhookUrl");
  });
  it("a rota dispara a partir da submissão e o player a informa", () => {
    expect(rota).toContain("dispararWebhookDoQuiz(");
    expect(rota).toContain("urlDeWebhookSegura(urlBruta)");
    expect(player).toContain("submissionId: id,");
  });
  it("o reclame é atômico e o redirecionamento é recusado", () => {
    expect(rota).toContain(".is(`tracking->>${CHAVE_WEBHOOK_ENVIADO}`, null)");
    expect(rota).toContain("redirect: 'manual'");
  });
});
