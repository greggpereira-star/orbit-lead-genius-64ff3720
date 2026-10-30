import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

/**
 * O inspetor mostra o editor rico de título e subtítulo em quase todo bloco.
 * Medido em 30/10/2026 com negrito + itálico + cor aplicados em cada tipo: em
 * quatro (depoimento, preços, notificação do iOS e chamada de áudio) o
 * renderizador desenhava `{title}` em texto puro, e a formatação sumia entre o
 * editor e a tela — o autor via o botão acender e o bloco não mudar.
 */
const arquivos = {
  prévia: readFileSync("src/modules/quiz/components/QuizPreview.tsx", "utf8"),
  player: readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8"),
};

function corpoDoCase(fonte: string, tipo: string): string {
  const inicio = fonte.search(new RegExp(`\\n\\s+case ["']${tipo}["']:`));
  expect(inicio, `case ${tipo} não encontrado`).toBeGreaterThan(-1);
  const resto = fonte.slice(inicio + 10);
  const proximo = resto.search(/\n {4}case ["'][a-z-]+["']:/);
  return resto.slice(0, proximo === -1 ? 6000 : proximo);
}

describe("blocos que mostram o editor rico desenham o formato", () => {
  for (const tipo of ["testimonial", "pricing", "ios-notification", "audio-call"]) {
    for (const [nome, fonte] of Object.entries(arquivos)) {
      it(`${tipo}: ${nome} usa titleRich`, () => {
        expect(corpoDoCase(fonte, tipo)).toContain("titleRich");
      });
    }
  }
  for (const tipo of ["ios-notification", "audio-call"]) {
    for (const [nome, fonte] of Object.entries(arquivos)) {
      it(`${tipo}: ${nome} usa subtitleRich`, () => {
        expect(corpoDoCase(fonte, tipo)).toContain("subtitleRich");
      });
    }
  }
});
