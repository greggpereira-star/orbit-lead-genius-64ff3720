/**
 * O banco recusa escrita fora de permissão com 42501 ("new row violates
 * row-level security policy", "permission denied for table ..."). A mensagem
 * crua aparecia no aviso da tela. Aqui ela vira texto de gente, uma vez só, na
 * saída do cliente — todo `toast.error(e.message)` do app passa a mostrar isto.
 *
 * Só mexe em resposta do PostgREST (/rest/v1/) com código 42501. Erro de
 * sessão expirada (JWT) e qualquer outro erro passam intactos.
 */
export const MENSAGEM_SEM_PERMISSAO =
  "Você não tem permissão para fazer isso. Se o seu acesso é somente leitura, peça a um administrador.";

export function ehRespostaDoPostgrest(url: string): boolean {
  return /\/rest\/v1\//.test(url);
}

export async function traduzirErroDePermissao(url: string, resposta: Response): Promise<Response> {
  if (resposta.ok || !ehRespostaDoPostgrest(url)) return resposta;
  if (resposta.status !== 401 && resposta.status !== 403) return resposta;
  try {
    const corpo = await resposta.clone().json();
    if (!corpo || corpo.code !== "42501") return resposta;
    const headers = new Headers(resposta.headers);
    headers.delete("content-length");
    return new Response(JSON.stringify({ ...corpo, message: MENSAGEM_SEM_PERMISSAO }), {
      status: resposta.status,
      statusText: resposta.statusText,
      headers,
    });
  } catch {
    return resposta;
  }
}

export function fetchComErroDePermissao(base: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const resposta = await base(input, init);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return traduzirErroDePermissao(url, resposta);
  };
}
