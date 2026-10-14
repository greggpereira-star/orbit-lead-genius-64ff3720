import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { origemDaVisita } from "./origemDaVisita";

/**
 * Medido em 14/10: dos 10 leads do Alt Quiz, nenhum tinha `landing_page` ou
 * `referrer`. As colunas existiam, a função SQL as lia de `p_tracking`, e
 * ninguém no cliente jamais as escrevia — duas pontas que nunca se encontraram.
 */
const local = { origin: "https://altleadflow.com.br", pathname: "/q/diagnostico-beleza-natural" };

describe("origemDaVisita", () => {
  it("grava o caminho da página de entrada", () => {
    expect(origemDaVisita(local, "").landing_page).toBe("/q/diagnostico-beleza-natural");
  });

  it("grava o referrer externo inteiro", () => {
    const r = origemDaVisita(local, "https://l.instagram.com/?u=abc");
    expect(r.referrer).toBe("https://l.instagram.com/?u=abc");
  });

  it("descarta referrer do PRÓPRIO site: navegação interna não é aquisição", () => {
    const r = origemDaVisita(local, "https://altleadflow.com.br/quizzes/abc/builder");
    expect(r.referrer).toBeUndefined();
    expect(r.landing_page).toBeDefined();
  });

  it("referrer vazio não vira chave — ausente preserva o valor já gravado", () => {
    // O `coalesce` do banco trata ausente e vazio de jeitos diferentes.
    expect("referrer" in origemDaVisita(local, "")).toBe(false);
    expect("referrer" in origemDaVisita(local, null)).toBe(false);
    expect("referrer" in origemDaVisita(local, undefined)).toBe(false);
  });

  it("referrer que não é URL válida é guardado, não descartado calado", () => {
    expect(origemDaVisita(local, "android-app://com.google.android.gm").referrer).toBe(
      "android-app://com.google.android.gm",
    );
  });

  it("limita o tamanho", () => {
    const longo = "https://exemplo.com/" + "a".repeat(2000);
    expect(origemDaVisita(local, longo).referrer!.length).toBeLessThanOrEqual(500);
  });
});

describe("o contrato entre o cliente e a função SQL", () => {
  /* Lê as migrações em ordem e pega a ÚLTIMA definição de `quiz_capture_lead`:
     é o que está valendo. Se a função parar de ler uma dessas chaves, o cliente
     continuaria mandando um dado que ninguém usa — o defeito ao contrário. */
  const pasta = "supabase/migrations";
  const arquivos = readdirSync(pasta)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const ultima = arquivos
    .filter((f) =>
      readFileSync(`${pasta}/${f}`, "utf8").includes("FUNCTION public.quiz_capture_lead"),
    )
    .pop();

  it("achou a definição da função", () => {
    expect(ultima, "nenhuma migração define quiz_capture_lead").toBeTruthy();
  });

  for (const chave of ["landing_page", "referrer"]) {
    it(`a função lê p_tracking->>'${chave}'`, () => {
      const sql = readFileSync(`${pasta}/${ultima}`, "utf8");
      expect(sql).toContain(`p_tracking->>'${chave}'`);
    });
  }
});

describe("o player manda a origem pelos DOIS pontos", () => {
  const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");

  it("na captura antecipada, que é onde o lead NASCE", () => {
    /* O `UPDATE` do envio final não toca em landing_page nem referrer. Se a
       origem só entrasse no final, o lead — já criado antes — ficaria sem. */
    const i = player.indexOf("captureQuizLead({");
    expect(i).toBeGreaterThan(0);
    expect(player.slice(i, i + 500)).toContain("tracking: trackingDaVisita()");
  });

  it("no envio final", () => {
    const i = player.indexOf("const enrichedTracking");
    expect(i).toBeGreaterThan(0);
    expect(player.slice(i, i + 200)).toContain("...trackingDaVisita()");
  });

  it("a query string continua mandando: ?utm_* vence a origem inferida", () => {
    const i = player.indexOf("const trackingDaVisita");
    expect(player.slice(i, i + 400)).toMatch(/\.\.\.tracking,\s*\}\)/);
  });
});
