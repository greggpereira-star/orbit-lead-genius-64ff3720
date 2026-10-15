/**
 * Conversões da régua de peso/altura.
 *
 * O valor do bloco é SEMPRE guardado em kg/cm; lb/pol só aparecem na tela.
 *
 * Guardar kg inteiro quebrava o ida-e-volta em libras: o visitante arrastava
 * até 67 lb, o valor virava 30 kg, e a régua voltava para 66 lb. Medido em
 * 66–441 lb: 205 de 376 valores (55%) não voltavam ao mesmo número. Com uma
 * casa decimal (0,1 kg ≈ 0,22 lb, abaixo de meio passo) a perda some.
 */
export type TipoDaRegua = "weight" | "height";
export type UnidadeDaRegua = "metric" | "imperial";

const FATOR = { weight: 2.20462, height: 0.393701 } as const;

export function paraExibicao(metrico: number, tipo: TipoDaRegua, unidade: UnidadeDaRegua): number {
  return unidade === "imperial" ? Math.round(metrico * FATOR[tipo]) : Math.round(metrico);
}

export function paraMetrico(
  exibido: number,
  tipo: TipoDaRegua,
  unidade: UnidadeDaRegua,
  limites: { min: number; max: number },
): number {
  const bruto = unidade === "imperial" ? Math.round((exibido / FATOR[tipo]) * 10) / 10 : exibido;
  return Math.min(limites.max, Math.max(limites.min, bruto));
}

/** Passo da régua NA UNIDADE EXIBIDA: o do autor em métrico, 1 em imperial. */
export function passoExibido(passoMetrico: number | undefined, unidade: UnidadeDaRegua): number {
  if (unidade === "imperial") return 1;
  return passoMetrico && passoMetrico > 0 ? passoMetrico : 1;
}
