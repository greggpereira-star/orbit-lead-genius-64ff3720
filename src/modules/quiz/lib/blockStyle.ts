/**
 * Estilo por bloco — o que alimenta as abas Layout e Aparência.
 *
 * Um resolvedor só, usado pelo canvas e pelo player. É a mesma regra do texto
 * rico: dois lugares desenhando por conta própria acabam divergindo, e aí o
 * usuário ajusta o espaçamento numa tela e vê outra coisa na publicada.
 *
 * Tudo é opcional e ausente = não escreve a propriedade. Um bloco sem estilo
 * renderiza exatamente como renderizava antes desta funcionalidade existir —
 * nada de valor "padrão" gravado no schema, que é o que costuma travar mudança
 * de tema depois.
 */
import type { CSSProperties } from 'react';
import type { QuizBlock } from '../types';

export interface BlockStyle {
  /** Espaço acima e abaixo do bloco, em px. */
  marginTop?: number;
  marginBottom?: number;
  /** Recuo interno, em px. */
  paddingX?: number;
  paddingY?: number;
  /** Largura máxima em px. Ausente = ocupa a largura disponível. */
  maxWidth?: number;
  /** Alinhamento do conteúdo e — quando há largura máxima — do próprio bloco. */
  align?: 'left' | 'center' | 'right';
  background?: string;
  textColor?: string;
  borderWidth?: number;
  borderColor?: string;
  /** Cantos, em px. */
  radius?: number;
}

/** Há algo configurado? Serve pra não criar um <div> de embrulho à toa. */
export function hasBlockStyle(block: QuizBlock): boolean {
  const s = block.blockStyle;
  if (!s) return false;
  return Object.values(s).some((v) => v !== undefined && v !== '' && v !== null);
}

export function resolveBlockStyle(block: QuizBlock): CSSProperties | undefined {
  const s = block.blockStyle;
  if (!s) return undefined;

  const style: CSSProperties = {};

  if (s.marginTop !== undefined) style.marginTop = s.marginTop;
  if (s.marginBottom !== undefined) style.marginBottom = s.marginBottom;
  if (s.paddingX !== undefined) {
    style.paddingLeft = s.paddingX;
    style.paddingRight = s.paddingX;
  }
  if (s.paddingY !== undefined) {
    style.paddingTop = s.paddingY;
    style.paddingBottom = s.paddingY;
  }

  // Alinhamento vale pro conteúdo sempre; o bloco em si só tem pra onde ir
  // quando é mais estreito que o espaço disponível.
  if (s.align) style.textAlign = s.align;
  if (s.maxWidth) {
    style.maxWidth = s.maxWidth;
    if (s.align === 'center') { style.marginLeft = 'auto'; style.marginRight = 'auto'; }
    else if (s.align === 'right') { style.marginLeft = 'auto'; }
  }

  if (s.background) style.background = s.background;
  if (s.textColor) style.color = s.textColor;
  if (s.borderWidth) {
    style.borderWidth = s.borderWidth;
    style.borderStyle = 'solid';
    style.borderColor = s.borderColor || 'currentColor';
  }
  if (s.radius !== undefined) style.borderRadius = s.radius;

  return Object.keys(style).length ? style : undefined;
}
