/**
 * Variáveis das frases rápidas: `{{nome}}` vira o nome do contato na hora de usar.
 * Variável sem valor conhecido é removida junto do espaço que a precede, para a frase não sair
 * com "Olá , tudo bem?" nem com chaves visíveis para o cliente.
 */

export interface ContextoDeFrase {
  nome?: string | null;
  telefone?: string | null;
  atendente?: string | null;
  empresa?: string | null;
}

export const VARIAVEIS_DE_FRASE = [
  { chave: "nome", rotulo: "Nome do contato" },
  { chave: "primeiro_nome", rotulo: "Primeiro nome" },
  { chave: "telefone", rotulo: "Telefone do contato" },
  { chave: "atendente", rotulo: "Seu nome" },
  { chave: "empresa", rotulo: "Nome da empresa" },
] as const;

function limpo(v: string | null | undefined): string {
  return (v ?? "").trim();
}

export function aplicarVariaveisDeFrase(texto: string, ctx: ContextoDeFrase): string {
  const nome = limpo(ctx.nome);
  const valores: Record<string, string> = {
    nome,
    primeiro_nome: nome.split(/\s+/)[0] ?? "",
    telefone: limpo(ctx.telefone),
    atendente: limpo(ctx.atendente),
    empresa: limpo(ctx.empresa),
  };
  return texto
    .replace(/(\s*)\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, espaco: string, chave: string) => {
      const v = valores[chave.toLowerCase()];
      if (v === undefined) return _m; // variável desconhecida: deixa como o autor escreveu
      return v ? `${espaco}${v}` : "";
    })
    .replace(/^\s+/, "");
}
