/**
 * Texto legível de qualquer coisa que tenha sido lançada.
 *
 * O caminho de autenticação lia `err.message` em doze pontos sem checar se o
 * campo existe. Dois estragos, que acontecem juntos:
 *
 * 1. `err.message.includes(...)` dentro de um `catch` lança `TypeError` quando
 *    o erro não tem `message` — um objeto simples, uma string lançada, um erro
 *    do PostgREST que só traz `code`. O erro ORIGINAL morre ali, substituído
 *    por um erro sobre a leitura do erro.
 * 2. `setError(\`... ${err.message}\`)` escreve "undefined" na tela, e
 *    `handleAuthFailure(err.message)` escreve `undefined` direto no estado —
 *    que foi o que produziu a caixa vermelha vazia vista em 08/10.
 *
 * Nenhum dos dois diz o que houve, e sem isso não há como consertar a causa.
 * Esta função nunca devolve vazio: quando não há nada legível, devolve a forma
 * crua, que ainda é melhor do que silêncio.
 */
export function mensagemDoErro(erro: unknown): string {
  if (typeof erro === "string") return erro;

  if (erro && typeof erro === "object") {
    const e = erro as Record<string, unknown>;

    for (const campo of ["message", "error_description", "msg", "details", "hint", "error"]) {
      const v = e[campo];
      if (typeof v === "string" && v.trim()) return v.trim();
    }

    /* Erro do PostgREST/GoTrue sem texto: o código é o que dá para investigar,
       e some se devolvermos vazio. */
    const code = e.code ?? e.status ?? e.statusCode;
    if (code !== undefined && code !== null && String(code).trim()) {
      return `Erro ${String(code)}`;
    }

    try {
      const json = JSON.stringify(erro);
      if (json && json !== "{}") return json.slice(0, 300);
    } catch {
      /* referência circular: cai no genérico abaixo */
    }
  }

  return "Erro sem descrição — veja o console para o objeto completo.";
}

/** `mensagemDoErro(e).includes(x)`, para os testes de texto do fluxo de auth. */
export function erroContem(erro: unknown, trecho: string): boolean {
  return mensagemDoErro(erro).toLowerCase().includes(trecho.toLowerCase());
}
