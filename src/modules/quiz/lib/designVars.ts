import type { CSSProperties } from 'react';
import { DEFAULT_DESIGN } from '../design-presets';
import type { QuizDesign } from '../types';

/**
 * Identidade do funil como variáveis CSS na raiz.
 *
 * O player aplicava cada propriedade de design direto no `style` de cada
 * elemento — são dezenas de pontos, e qualquer propriedade nova obrigava a
 * caçar todos eles. Com as variáveis na raiz, o valor nasce num lugar só e
 * desce por herança, inclusive para blocos que ainda nem existem.
 *
 * As propriedades antigas continuam sendo aplicadas em linha onde já estavam:
 * esta camada é aditiva, para não arriscar a aparência de quiz publicado.
 */
export function designVars(design: QuizDesign): CSSProperties {
  const d = { ...DEFAULT_DESIGN, ...design };
  return {
    '--quiz-primary': d.primary,
    '--quiz-background': d.background,
    '--quiz-surface': d.surface,
    '--quiz-text': d.text,
    '--quiz-muted': d.muted,
    /* Título tem cor própria: quando o usuário não define, herda o texto.
       O `??` precisa ler o design CRU, e não o mesclado: um valor de título no
       DEFAULT_DESIGN venceria a herança e pintaria de claro o título de todo
       quiz de fundo claro que nunca escolheu cor nenhuma. */
    '--quiz-title': design.titleColor ?? d.text,
    '--quiz-title-size': `${d.titleSize ?? 28}px`,
    '--quiz-content-size': `${d.contentSize ?? 16}px`,
    '--quiz-element-size': `${d.elementSize ?? 56}px`,
    '--quiz-radius': `${d.radius}px`,
    '--quiz-font-heading': d.fontHeading,
    '--quiz-font-body': d.fontBody,
  } as CSSProperties;
}

/** Largura máxima do conteúdo, com o 448 de sempre como padrão. */
export function contentWidth(design: QuizDesign): number {
  return design.contentWidth ?? 448;
}

/** Distribuição vertical quando sobra altura na etapa. */
export function verticalAlignClass(design: QuizDesign): string {
  switch (design.verticalAlign) {
    case 'start':
      return 'justify-start';
    case 'center':
      return 'justify-center';
    default:
      return 'justify-between';
  }
}
