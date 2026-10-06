import type { QuizDesign } from "../types";
import { withAlpha } from "./color";

export type VarianteDeAlerta = "info" | "sucesso" | "atencao" | "erro" | "neutro" | "tema";

export const VARIANTES_DE_ALERTA: { valor: VarianteDeAlerta; rotulo: string }[] = [
  { valor: "info", rotulo: "Informação" },
  { valor: "sucesso", rotulo: "Sucesso" },
  { valor: "atencao", rotulo: "Atenção" },
  { valor: "erro", rotulo: "Erro" },
  { valor: "neutro", rotulo: "Neutro" },
  { valor: "tema", rotulo: "Cor do tema" },
];

/** Matiz de cada variante. `neutro` e `tema` saem do design do quiz. */
const MATIZ: Record<Exclude<VarianteDeAlerta, "neutro" | "tema">, string> = {
  info: "#2563EB",
  sucesso: "#059669",
  atencao: "#D97706",
  erro: "#DC2626",
};

export interface EstiloDoAlerta {
  fundo: string;
  borda: string;
  /** Cor do ícone e da barra — é quem carrega o significado. */
  destaque: string;
  /** Cor do texto. */
  texto: string;
}

/**
 * Cores de um alerta dentro do quiz.
 *
 * A decisão que vale registrar: **o texto usa a cor de texto do TEMA, não o
 * matiz da variante.** Um alerta vermelho escrito em vermelho sobre um fundo
 * tingido de vermelho funciona num tema claro e vira mancha ilegível nos temas
 * escuros do produto (Aurora, Mono, Gold) — e o autor do funil escolhe o tema
 * depois de escrever o alerta, então não dá para resolver no texto.
 *
 * O significado fica no ícone e na borda, que são o matiz cheio e leem bem
 * sobre os dois fundos. É a mesma ideia do `--sucesso`/`--aviso` do app: o
 * forte para o traço, o suave para o fundo.
 */
export function estiloDoAlerta(
  variante: VarianteDeAlerta | undefined,
  design: Pick<QuizDesign, "primary" | "muted" | "text">,
): EstiloDoAlerta {
  const v = variante ?? "info";
  const matiz = v === "tema" ? design.primary : v === "neutro" ? design.muted : MATIZ[v];
  return {
    fundo: withAlpha(matiz, 0.12),
    borda: withAlpha(matiz, 0.35),
    destaque: matiz,
    texto: design.text,
  };
}
