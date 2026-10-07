export type Dispositivo = "mobile" | "tablet" | "desktop";

export interface MedidaDoDispositivo {
  largura: number;
  /** Altura da área visível do aparelho — onde fica a dobra. */
  altura: number;
  rotulo: string;
}

/**
 * Medidas reais, não números redondos.
 *
 * 390×844 é o iPhone 14/15; 820×1180 é o iPad Air; 1280×800 é o notebook
 * comum. A ALTURA é a parte que faltava: sem ela não há como dizer o que o
 * visitante vê antes de rolar, que é a pergunta que decide a conversão de um
 * quiz — e era a única coisa que a prévia de celular não contava.
 */
export const DISPOSITIVOS: Record<Dispositivo, MedidaDoDispositivo> = {
  mobile: { largura: 390, altura: 844, rotulo: "celular" },
  tablet: { largura: 820, altura: 1180, rotulo: "tablet" },
  desktop: { largura: 1280, altura: 800, rotulo: "notebook" },
};

/**
 * Largura que a moldura realmente pode ocupar.
 *
 * Medido no construtor em 07/10: a área do canvas tem 1105px e a moldura de
 * desktop pedia 1280 fixos — 184px da tela simulada ficavam permanentemente
 * fora, com rolagem horizontal obrigatória. Uma prévia que não cabe mente
 * sobre o que está sendo editado. Encolher é melhor do que cortar: a largura
 * de desktop do visitante varia de qualquer jeito.
 *
 * `disponivel` em 0 ou negativo significa "ainda não medi" — devolve a
 * preferida em vez de colapsar a moldura para nada.
 */
export function larguraQueCabe(preferida: number, disponivel: number): number {
  if (!Number.isFinite(disponivel) || disponivel <= 0) return preferida;
  return Math.min(preferida, disponivel);
}

/**
 * A dobra só vale como marca se houver conteúdo depois dela.
 *
 * Uma etapa curta que cabe inteira na tela não tem dobra: desenhar a linha ali
 * anunciaria um problema que não existe.
 */
export function mostrarDobra(alturaDoConteudo: number, alturaDoDispositivo: number): boolean {
  return alturaDoConteudo > alturaDoDispositivo + 8;
}
