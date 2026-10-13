/**
 * Como um vídeo do quiz é tocado: arquivo direto ou incorporação.
 *
 * Existia duas vezes — uma cópia inline dentro do player e `getVideoEmbed`
 * dentro da prévia — e as duas erravam a mesma coisa.
 *
 * O inspetor oferece o provedor "Upload", que grava `mediaProvider: "file"`, e
 * o enviador aceita `video/mp4`, `video/webm` e `video/quicktime`. Mas os dois
 * renderizadores só reconheciam `"mp4"` ou URL terminada em `.mp4`. Resultado:
 * quem enviava `.webm` ou `.mov` tinha o vídeo desenhado como `<iframe>` em vez
 * de `<video controls>` — e o enviador, que trata as três extensões como vídeo,
 * mostrava ao autor exatamente o que o visitante não ia receber.
 */

/**
 * Extensões que o enviador aceita em `accept="video"`.
 *
 * Precisa acompanhar `ACCEPT_MAP.video` no `MediaUploader`: aceitar um formato
 * lá e não reconhecer aqui é como este defeito nasceu. O teste compara os dois.
 */
export const EXTENSOES_DE_VIDEO = /\.(mp4|webm|mov)($|\?)/i;

export interface VideoDoQuiz {
  /** `arquivo` toca em `<video>`; `iframe` é YouTube, Vimeo ou outro embed. */
  kind: "arquivo" | "iframe";
  src: string;
}

export function getVideoEmbed(url: string, provider?: string): VideoDoQuiz | null {
  if (!url) return null;

  /* `file` entra aqui junto de `mp4`: é o valor que o seletor "Upload" grava, e
     deixá-lo de fora era metade do defeito. */
  if (provider === "mp4" || provider === "file" || EXTENSOES_DE_VIDEO.test(url)) {
    return { kind: "arquivo", src: url };
  }

  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  if (yt) return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}` };

  const vim = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vim) return { kind: "iframe", src: `https://player.vimeo.com/video/${vim[1]}` };

  return { kind: "iframe", src: url };
}

/**
 * Se a capa (`posterUrl`) tem efeito.
 *
 * Só arquivo direto aceita `poster`: YouTube e Vimeo trazem miniatura própria e
 * ignoram o atributo. Oferecer o campo num vídeo do YouTube seria mais um
 * controle que não faz nada.
 */
export function aceitaCapa(url?: string, provider?: string): boolean {
  return getVideoEmbed(url ?? "", provider)?.kind === "arquivo";
}
