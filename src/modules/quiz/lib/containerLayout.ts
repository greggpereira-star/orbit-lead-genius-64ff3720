import type { QuizBlock, ContainerBreakpointLayout } from '../types';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

export interface ResolvedContainerLayout {
  layoutMode: 'flex' | 'grid';
  columns: number;
  gap: number;
  align: 'start' | 'center' | 'end' | 'stretch';
  justify: 'start' | 'center' | 'end' | 'stretch';
}

const DEFAULTS: ResolvedContainerLayout = {
  layoutMode: 'flex',
  columns: 2,
  gap: 16,
  align: 'stretch',
  justify: 'start',
};

function withOverride(base: ResolvedContainerLayout, override?: ContainerBreakpointLayout): ResolvedContainerLayout {
  if (!override) return base;
  return {
    layoutMode: override.layoutMode ?? base.layoutMode,
    columns: override.columns ?? base.columns,
    gap: override.gap ?? base.gap,
    align: override.align ?? base.align,
    justify: override.justify ?? base.justify,
  };
}

// Resolve o layout efetivo de um Container num breakpoint — Mobile é a base
// ("padrão"), Tablet herda de Mobile só substituindo o que foi customizado, e
// Desktop herda do resultado já resolvido do Tablet (cascata, igual CSS normal).
export function resolveContainerLayout(block: QuizBlock, breakpoint: Breakpoint): ResolvedContainerLayout {
  const mobile: ResolvedContainerLayout = {
    layoutMode: block.containerLayoutMode ?? DEFAULTS.layoutMode,
    columns: block.containerColumns ?? DEFAULTS.columns,
    gap: block.containerGap ?? DEFAULTS.gap,
    align: block.containerAlign ?? DEFAULTS.align,
    justify: block.containerJustify ?? DEFAULTS.justify,
  };
  if (breakpoint === 'mobile') return mobile;
  const tablet = withOverride(mobile, block.containerTablet);
  if (breakpoint === 'tablet') return tablet;
  return withOverride(tablet, block.containerDesktop);
}
