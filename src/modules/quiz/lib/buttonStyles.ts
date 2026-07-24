import type { CSSProperties } from 'react';
import type { ButtonStyle, QuizDesign } from '../types';
import { getContrastText, lighten, darken } from './color';

// ============ Galeria de estilos de botão (Funilix parity) ============
// Cada estilo é computado a partir da cor de marca do PRÓPRIO quiz (design.primary),
// não de uma paleta fixa — assim qualquer estilo combina com qualquer tema. Alguns
// estilos (shimmer/pulse/lift) dependem de uma classe global definida em
// src/styles.css (animação/hover não dá pra fazer só com style inline).

export const BUTTON_STYLE_OPTIONS: { id: ButtonStyle; label: string; description: string }[] = [
  { id: 'solid', label: 'Sólido', description: 'Botão sólido clássico' },
  { id: 'gradient', label: 'Gradiente', description: 'Degradê suave na cor de marca' },
  { id: 'outline', label: 'Contorno', description: 'Contorno com fundo transparente' },
  { id: 'ghost', label: 'Fantasma', description: 'Discreto, foco no texto' },
  { id: 'neon', label: 'Neon', description: 'Brilho neon vibrante' },
  { id: 'glow', label: 'Brilho', description: 'Brilho suave ao redor' },
  { id: 'lift', label: 'Elevação', description: 'Eleva ao passar o mouse' },
  { id: 'shimmer', label: 'Reflexo', description: 'Brilho deslizante animado' },
  { id: 'pulse', label: 'Pulsante', description: 'Anel pulsante pra destacar' },
  { id: 'soft-shadow', label: 'Sombra suave', description: 'Estilo macio com luz e sombra' },
  { id: 'relief', label: 'Relevo', description: 'Botão 3D com profundidade real' },
  { id: 'capsule', label: 'Cápsula', description: 'Pílula 3D com gradiente' },
  { id: 'brutalist', label: 'Brutalismo', description: 'Borda forte e sombra offset' },
  { id: 'soft-3d', label: '3D Suave', description: 'Pressão suave em camadas' },
  { id: 'tilt', label: 'Inclinado', description: 'Perspectiva com profundidade' },
];

export interface ButtonStyleResult {
  style: CSSProperties;
  className?: string;
}

export function getButtonStyle(design: Pick<QuizDesign, 'primary' | 'radius' | 'text' | 'buttonStyle'>): ButtonStyleResult {
  const { primary, radius, text, buttonStyle } = design;
  const contrast = getContrastText(primary);
  const base: CSSProperties = { borderRadius: radius };

  switch (buttonStyle) {
    case 'gradient':
      return { style: { ...base, backgroundImage: `linear-gradient(135deg, ${primary}, ${primary}cc)`, color: contrast } };

    case 'outline':
      return { style: { ...base, border: `2px solid ${primary}`, color: primary, background: 'transparent' } };

    case 'ghost':
      return { style: { ...base, color: primary, background: 'transparent' } };

    case 'neon':
      return {
        style: {
          ...base,
          background: '#0a0a0a',
          color: primary,
          border: `2px solid ${primary}`,
          boxShadow: `0 0 8px ${primary}bb, 0 0 22px ${primary}66, inset 0 0 10px ${primary}33`,
        },
      };

    case 'glow':
      return { style: { ...base, background: primary, color: contrast, boxShadow: `0 6px 28px ${primary}77` } };

    case 'lift':
      return {
        style: { ...base, background: primary, color: contrast, boxShadow: `0 2px 6px ${primary}44` },
        className: 'quiz-btn-lift',
      };

    case 'shimmer':
      return {
        style: {
          ...base,
          color: contrast,
          backgroundImage: `linear-gradient(110deg, ${primary} 40%, ${lighten(primary, 0.35)} 50%, ${primary} 60%)`,
          backgroundSize: '250% 100%',
        },
        className: 'quiz-btn-shimmer',
      };

    case 'pulse':
      return {
        style: { ...base, background: primary, color: contrast, ['--quiz-pulse-color' as string]: `${primary}80` },
        className: 'quiz-btn-pulse',
      };

    case 'soft-shadow':
      return {
        style: { ...base, background: primary, color: contrast, boxShadow: `0 10px 24px -6px ${primary}55, 0 2px 8px ${primary}33` },
      };

    case 'relief':
      return {
        style: {
          ...base,
          background: primary,
          color: contrast,
          boxShadow: `inset 0 1px 0 rgba(255,255,255,.35), inset 0 -3px 4px rgba(0,0,0,.2), 0 3px 0 ${darken(primary, 0.3)}`,
        },
      };

    case 'capsule':
      return {
        style: {
          borderRadius: 999,
          color: contrast,
          backgroundImage: `linear-gradient(180deg, ${lighten(primary, 0.18)}, ${primary})`,
          boxShadow: `0 6px 14px ${primary}55, inset 0 1px 0 rgba(255,255,255,.4)`,
        },
      };

    case 'brutalist':
      return {
        style: { borderRadius: 2, background: primary, color: contrast, border: `3px solid ${text}`, boxShadow: `4px 4px 0 ${text}` },
      };

    case 'soft-3d':
      return {
        style: { ...base, background: primary, color: contrast, boxShadow: `0 3px 0 ${darken(primary, 0.25)}, 0 6px 10px rgba(0,0,0,.15)` },
      };

    case 'tilt':
      return {
        style: { ...base, background: primary, color: contrast, boxShadow: `0 10px 20px ${primary}44`, transform: 'perspective(300px) rotateX(6deg)' },
      };

    default: // solid
      return { style: { ...base, background: primary, color: contrast } };
  }
}
