/**
 * URL estável para a mídia do quiz.
 *
 * O bucket `quiz-media` é privado e o upload gravava no schema uma URL ASSINADA que
 * vale no máximo 1 ano. Passado um ano, toda imagem, vídeo e áudio de quiz publicado
 * quebra, sem erro nenhum. A URL que vai para o schema agora é um endereço do próprio
 * app (`/api/public/quiz-media/<caminho>`) que, a cada acesso, assina uma URL nova de
 * curta duração e redireciona. O endereço nunca vence.
 *
 * Quizzes antigos, com a URL assinada gravada, são reescritos na LEITURA pública por
 * `estabilizarMidia` — sem mexer no banco e sem esperar a expiração.
 */

export const PREFIXO_MIDIA = "/api/public/quiz-media/";

/** Caminho no bucket: segmentos simples, sem `..`, no máximo 6 níveis. */
const CAMINHO_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}(\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}){0,5}$/;

export function caminhoValido(caminho: string): boolean {
  return CAMINHO_VALIDO.test(caminho) && !caminho.includes("..");
}

export function urlEstavel(caminho: string): string {
  return `${PREFIXO_MIDIA}${caminho}`;
}

/** Extrai o caminho de uma URL assinada do bucket quiz-media (qualquer host); senão, `null`. */
export function caminhoDeUrlAssinada(url: string): string | null {
  const m = /\/storage\/v1\/object\/sign\/quiz-media\/([^?#]+)\?token=/.exec(url);
  if (!m) return null;
  let caminho: string;
  try {
    caminho = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return caminhoValido(caminho) ? caminho : null;
}

/** Reescreve, em qualquer ponto do schema, URLs assinadas do quiz-media para a estável. */
export function estabilizarMidia<T>(valor: T): T {
  if (typeof valor === "string") {
    const caminho = valor.startsWith("http") ? caminhoDeUrlAssinada(valor) : null;
    return (caminho ? urlEstavel(caminho) : valor) as T;
  }
  if (Array.isArray(valor)) return valor.map((v) => estabilizarMidia(v)) as T;
  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) saida[k] = estabilizarMidia(v);
    return saida as T;
  }
  return valor;
}
