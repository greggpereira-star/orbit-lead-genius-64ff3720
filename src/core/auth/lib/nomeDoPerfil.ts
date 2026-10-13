/**
 * O nome que o time vê.
 *
 * Campo pequeno, e por isso mesmo fácil de deixar aceitar qualquer coisa. Ele
 * aparece no topo da tela, no menu da conta e — quando houver histórico de
 * ações — ao lado de cada coisa que a pessoa fez. Um nome em branco ou com
 * quebras de linha estraga as três.
 */

/** Maior nome que cabe sem quebrar os lugares onde ele aparece. */
export const LIMITE_DO_NOME = 80;

/**
 * Nome pronto para gravar: sem espaço sobrando e sem quebra de linha.
 *
 * Colapsa espaços repetidos porque "Maria   Silva" e "Maria Silva" são a mesma
 * pessoa digitada com pressa, e guardar os dois faria o mesmo nome aparecer
 * diferente em telas diferentes.
 */
export function normalizarNome(bruto: string | null | undefined): string {
  return (bruto ?? "").replace(/\s+/g, " ").trim();
}

export type ProblemaDoNome = "vazio" | "curto" | "longo" | null;

/**
 * O que impede gravar, se algo impedir.
 *
 * Um caractere não é nome, e devolver "curto" em vez de aceitar evita o caso
 * em que alguém apaga tudo, digita uma letra sem querer e salva — passando a
 * aparecer como "a" para o time inteiro.
 */
export function problemaDoNome(bruto: string | null | undefined): ProblemaDoNome {
  const nome = normalizarNome(bruto);
  if (!nome) return "vazio";
  if (nome.length < 2) return "curto";
  if (nome.length > LIMITE_DO_NOME) return "longo";
  return null;
}

/** A mensagem que a pessoa lê, para cada impedimento. */
export const AVISO_DO_NOME: Record<NonNullable<ProblemaDoNome>, string> = {
  vazio: "Escreva seu nome.",
  curto: "O nome precisa ter ao menos 2 letras.",
  longo: `O nome passa de ${LIMITE_DO_NOME} caracteres.`,
};

/** Se há o que gravar: nome válido E diferente do que já está salvo. */
export function mudou(novo: string | null | undefined, atual: string | null | undefined): boolean {
  return !problemaDoNome(novo) && normalizarNome(novo) !== normalizarNome(atual);
}
