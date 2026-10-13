import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { getVideoEmbed, aceitaCapa, EXTENSOES_DE_VIDEO } from "./videoEmbed";

/**
 * O defeito que isto trava: o seletor de provedor oferece "Upload", que grava
 * `mediaProvider: "file"`, e o enviador aceita mp4, webm e mov. Os dois
 * renderizadores — cada um com sua cópia da detecção — só reconheciam `"mp4"`
 * ou URL terminada em `.mp4`.
 *
 * Quem enviava `.webm` ou `.mov` recebia o vídeo dentro de um `<iframe>` em vez
 * de `<video controls>`. E o enviador, que trata as três extensões como vídeo,
 * mostrava ao autor um player normal — exatamente o que o visitante não ia ver.
 */
describe("o que é arquivo direto e o que é incorporação", () => {
  it("o provedor Upload conta como arquivo, qualquer que seja a extensão", () => {
    // Era isto que faltava: `file` é o valor que o seletor grava.
    expect(getVideoEmbed("https://x/v.webm", "file")?.kind).toBe("arquivo");
    expect(getVideoEmbed("https://x/v.mov", "file")?.kind).toBe("arquivo");
    expect(getVideoEmbed("https://x/sem-extensao", "file")?.kind).toBe("arquivo");
  });

  it("as três extensões do enviador contam, mesmo sem provedor", () => {
    for (const ext of ["mp4", "webm", "mov"]) {
      expect(getVideoEmbed(`https://x/v.${ext}`)?.kind, ext).toBe("arquivo");
      expect(getVideoEmbed(`https://x/v.${ext}?token=abc`)?.kind, `${ext} com query`).toBe(
        "arquivo",
      );
    }
  });

  it("YouTube e Vimeo viram incorporação, com a URL de player", () => {
    expect(getVideoEmbed("https://youtu.be/abc123")).toEqual({
      kind: "iframe",
      src: "https://www.youtube.com/embed/abc123",
    });
    expect(getVideoEmbed("https://vimeo.com/987654")).toEqual({
      kind: "iframe",
      src: "https://player.vimeo.com/video/987654",
    });
  });

  it("sem URL não há vídeo", () => {
    expect(getVideoEmbed("")).toBeNull();
  });
});

describe("a capa só é oferecida onde funciona", () => {
  it("vale para arquivo direto", () => {
    expect(aceitaCapa("https://x/v.webm", "file")).toBe(true);
    expect(aceitaCapa("https://x/v.mp4")).toBe(true);
  });

  it("não vale para YouTube nem Vimeo — eles ignoram `poster`", () => {
    expect(aceitaCapa("https://youtu.be/abc123")).toBe(false);
    expect(aceitaCapa("https://vimeo.com/987654")).toBe(false);
  });
});

describe("as duas listas de formato não podem divergir", () => {
  /* Foi exatamente assim que o defeito nasceu: o enviador passou a aceitar três
     formatos e a detecção continuou olhando um. */
  const uploader = readFileSync("src/modules/quiz/components/MediaUploader.tsx", "utf8");

  it("todo formato que o enviador aceita é reconhecido como arquivo", () => {
    const linha = uploader.slice(
      uploader.indexOf("video:"),
      uploader.indexOf("\n", uploader.indexOf("video:")),
    );
    const aceitos = [...linha.matchAll(/video\/([a-z0-9]+)/g)].map((m) => m[1]);
    expect(aceitos.length, `não li o accept do enviador: ${linha}`).toBeGreaterThanOrEqual(3);

    /* `quicktime` é o tipo MIME do `.mov`; a extensão é o que aparece na URL. */
    const extensaoDe: Record<string, string> = { mp4: "mp4", webm: "webm", quicktime: "mov" };
    for (const mime of aceitos) {
      const ext = extensaoDe[mime];
      expect(
        ext,
        `formato "${mime}" aceito pelo enviador e sem extensão mapeada aqui`,
      ).toBeTruthy();
      expect(EXTENSOES_DE_VIDEO.test(`https://x/v.${ext}`), ext).toBe(true);
    }
  });
});

describe("os dois renderizadores usam a mesma detecção", () => {
  const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
  const canvas = readFileSync("src/modules/quiz/components/QuizPreview.tsx", "utf8");

  it("nenhum dos dois mantém cópia própria", () => {
    for (const [nome, fonte] of [
      ["player", player],
      ["prévia", canvas],
    ] as const) {
      // Aspas simples ou duplas: os dois arquivos seguem estilos diferentes, e
      // exigir um deles reprovaria por formatação, não por defeito.
      expect(fonte, `${nome} não importa a detecção compartilhada`).toMatch(
        /from ['"]\.\.\/lib\/videoEmbed['"]/,
      );
      expect(fonte, `${nome} voltou a detectar mp4 por conta própria`).not.toMatch(
        /\\\.mp4\(\$\|\\\?\)/,
      );
    }
  });

  it("o player passa a capa para o <video>", () => {
    expect(player).toContain("poster={block.posterUrl}");
  });
});
