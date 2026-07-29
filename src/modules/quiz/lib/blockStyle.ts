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
  /**
   * Tipografia do bloco inteiro. Ausente = herda a fonte do tema do quiz — que
   * é o que mantém o funil coerente. Vale como padrão do bloco; cada elemento
   * abaixo pode sobrescrever.
   */
  fontFamily?: string;
  /** Tamanho base, em px. */
  fontSize?: number;

  /**
   * Tipografia por elemento.
   *
   * Existe porque o controle de bloco sozinho não alcançava o título: ele era
   * escrito num <div> de embrulho e chegava aos filhos só por HERANÇA, que é a
   * origem mais fraca do CSS. Qualquer elemento que declarasse a própria fonte
   * — e o título declarava `design.fontHeading` inline — ganhava sempre. O
   * resultado era um controle que funcionava em metade das propriedades e em
   * metade dos elementos, sem nada na tela explicando por quê.
   */
  title?: TextStyle;
  subtitle?: TextStyle;
  options?: TextStyle;
  button?: TextStyle;
}

/** Tipografia de um elemento. Tudo opcional: ausente = usa o nível de cima. */
export interface TextStyle {
  fontFamily?: string;
  /** Em px. Vence a classe de tamanho do componente, que é o padrão do tema. */
  fontSize?: number;
  color?: string;
  /** 400 normal … 800 extra-bold. */
  weight?: number;
}

/** Os elementos que aceitam tipografia própria, na ordem em que aparecem na tela. */
export const TEXT_SLOTS = [
  { key: 'title', label: 'Título' },
  { key: 'subtitle', label: 'Subtítulo' },
  { key: 'options', label: 'Opções' },
  { key: 'button', label: 'Botão' },
] as const;

export type TextSlot = (typeof TEXT_SLOTS)[number]['key'];

/**
 * Resolve a tipografia de um elemento na ordem elemento → bloco → tema.
 *
 * O `fallback` é o que o tema quer. Ele entra como PADRÃO, não como imposição:
 * era exatamente essa inversão que fazia o seletor de fonte não ter efeito no
 * título. Devolver `undefined` numa propriedade é intencional — assim o
 * componente segue com a própria classe do Tailwind e o bloco não fica com um
 * valor gravado que trava a troca de tema depois.
 */
export function resolveTextStyle(
  block: QuizBlock,
  slot: TextSlot,
  fallback?: CSSProperties,
): CSSProperties | undefined {
  const s = block.blockStyle;
  const el = s?.[slot];

  const style: CSSProperties = { ...(fallback ?? {}) };

  const fontFamily = el?.fontFamily ?? s?.fontFamily;
  if (fontFamily) style.fontFamily = fontFamily;

  const fontSize = el?.fontSize ?? s?.fontSize;
  if (fontSize) style.fontSize = fontSize;

  // A cor do bloco só desce para o elemento quando ele não tem a própria. O
  // subtítulo é o caso que importa: ele nasce com a cor "muted" do tema, e sem
  // isto a cor escolhida no bloco nunca chegava nele.
  const color = el?.color ?? s?.textColor;
  if (color) style.color = color;

  if (el?.weight) style.fontWeight = el.weight;

  return Object.keys(style).length ? style : undefined;
}

/** Algum elemento deste bloco tem tipografia própria? Usado pelo inspetor. */
export function hasTextStyle(block: QuizBlock, slot: TextSlot): boolean {
  const el = block.blockStyle?.[slot];
  return !!el && Object.values(el).some((v) => v !== undefined && v !== '' && v !== null);
}

/** Fontes já carregadas globalmente pelo app — não adianta oferecer outras. */
export const BLOCK_FONTS = [
  'Inter',
  'Space Grotesk',
  'Playfair Display',
  'Fraunces',
  'Fredoka',
] as const;

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

  if (s.fontFamily) style.fontFamily = s.fontFamily;
  if (s.fontSize) style.fontSize = s.fontSize;

  return Object.keys(style).length ? style : undefined;
}
