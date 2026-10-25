/**
 * Regras da equipe: quem convida, altera e remove quem.
 *
 *   owner   convida administrador, atendente e visualizador; altera e remove todos,
 *           menos a si mesmo e outros donos;
 *   admin   convida atendente e visualizador; altera e remove só atendente e visualizador;
 *   demais  nada.
 *
 * `owner` nunca é convidável nem atribuível por esta tela: passar a titularidade é outro
 * assunto, e um dono removido por engano deixaria a empresa sem ninguém que a administre.
 * Ninguém muda ou remove o próprio papel.
 */
export type PapelDaEquipe = "owner" | "admin" | "member" | "viewer";
export type PapelConvidavel = "admin" | "member" | "viewer";

export const PAPEIS_CONVIDAVEIS: readonly PapelConvidavel[] = ["admin", "member", "viewer"];

export const ROTULO_DO_PAPEL: Record<PapelDaEquipe, string> = {
  owner: "Dono",
  admin: "Administrador",
  member: "Atendente",
  viewer: "Visualizador",
};

export const ehPapelConvidavel = (p: unknown): p is PapelConvidavel =>
  typeof p === "string" && (PAPEIS_CONVIDAVEIS as readonly string[]).includes(p);

/** Papéis que `quem` pode conceder (convite ou troca de papel). */
export function papeisQueEuPossoConceder(quem: string): PapelConvidavel[] {
  if (quem === "owner") return ["admin", "member", "viewer"];
  if (quem === "admin") return ["member", "viewer"];
  return [];
}

export const podeConvidar = (quem: string, papel: string): boolean =>
  ehPapelConvidavel(papel) && papeisQueEuPossoConceder(quem).includes(papel);

/** Quem pode mexer num membro que hoje tem `papelAtual`. */
function podeMexerEm(quem: string, papelAtual: string): boolean {
  if (papelAtual === "owner") return false;
  if (quem === "owner") return true;
  if (quem === "admin") return papelAtual === "member" || papelAtual === "viewer";
  return false;
}

export function podeAlterarPapel(a: {
  quem: string;
  ehEuMesmo: boolean;
  papelAtual: string;
  novoPapel: string;
}): boolean {
  if (a.ehEuMesmo) return false;
  if (!podeMexerEm(a.quem, a.papelAtual)) return false;
  return podeConvidar(a.quem, a.novoPapel);
}

export function podeRemover(a: { quem: string; ehEuMesmo: boolean; papelAtual: string }): boolean {
  if (a.ehEuMesmo) return false;
  return podeMexerEm(a.quem, a.papelAtual);
}

export const normalizarEmail = (e: string): string => e.trim().toLowerCase();

/** Validação simples de formato; a prova de que o e-mail é da pessoa é a confirmação do cadastro. */
export function emailValido(e: string): boolean {
  const s = normalizarEmail(e);
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

/** Texto curto para o convite: quando vence, em dias inteiros (arredonda para cima). */
export function diasParaVencer(expiraEm: string | Date, agora: Date = new Date()): number {
  const ms = new Date(expiraEm).getTime() - agora.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}
