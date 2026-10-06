export type TipoDeMidia = "video" | "audio" | "imagem";

export interface MidiaDaResposta {
  tipo: TipoDeMidia;
  url: string;
}

const EXTENSOES: Record<TipoDeMidia, RegExp> = {
  video: /\.(webm|mp4|mov|m4v)$/i,
  audio: /\.(mp3|wav|ogg|m4a)$/i,
  imagem: /\.(jpe?g|png|webp|gif|avif)$/i,
};

/**
 * A resposta é um arquivo que dá para ver/ouvir?
 *
 * Existe por causa do bloco Vídeo Resposta: a resposta guardada é a URL do
 * arquivo, e a ficha do lead desenhava `{a.value}` truncado — o corretor via
 * meia URL assinada e nenhum vídeo. Coletar e não poder assistir não é
 * funcionalidade.
 *
 * **A extensão é lida do CAMINHO, não da string inteira.** A URL assinada do
 * Supabase termina em `?token=eyJhbGciOi…`, então `endsWith('.webm')` dá falso
 * em toda resposta real — e passaria no teste se o teste usasse uma URL limpa.
 */
export function midiaDaResposta(valor: string | undefined): MidiaDaResposta | null {
  if (!valor) return null;
  const texto = valor.trim();
  if (!/^https?:\/\//i.test(texto)) return null;

  let caminho: string;
  try {
    caminho = new URL(texto).pathname;
  } catch {
    return null;
  }

  for (const tipo of ["video", "audio", "imagem"] as TipoDeMidia[]) {
    if (EXTENSOES[tipo].test(caminho)) return { tipo, url: texto };
  }
  return null;
}
