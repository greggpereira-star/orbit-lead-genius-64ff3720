import type { CSSProperties } from 'react';
import type { QuizBlock, QuizDesign, QuizStep } from '../types';

/**
 * Design efetivo de uma etapa: o do funil, com o que a etapa sobrescrever.
 *
 * Só as chaves presentes em `step.design` mandam — uma etapa que define apenas
 * o fundo continua herdando fonte, raio e cor de texto do funil. É o que
 * permite "a oferta num fundo escuro" sem reconfigurar a tela inteira.
 */
export function designDaEtapa(design: QuizDesign, step: QuizStep | undefined): QuizDesign {
  if (!step?.design) return design;
  const limpo = Object.fromEntries(
    Object.entries(step.design).filter(([, v]) => v !== undefined && v !== ''),
  );
  return { ...design, ...limpo } as QuizDesign;
}

/** O bloco tem cor própria em algum slot? */
export function temCorPropria(block: QuizBlock): boolean {
  return !!(block.corDeFundo || block.corDoTexto || block.corDeDestaque);
}

/**
 * Cores do bloco como variáveis locais.
 *
 * Sobrescrevem as mesmas variáveis que a raiz publica, então tudo que já lê
 * `var(--quiz-*)` dentro do bloco passa a enxergar a cor dele sem nenhuma
 * mudança nos componentes.
 */
export function varsDoBloco(block: QuizBlock): CSSProperties | undefined {
  if (!temCorPropria(block)) return undefined;
  const v: Record<string, string> = {};
  if (block.corDeFundo) v['--quiz-surface'] = block.corDeFundo;
  if (block.corDoTexto) {
    v['--quiz-text'] = block.corDoTexto;
    v['--quiz-title'] = block.corDoTexto;
  }
  if (block.corDeDestaque) v['--quiz-primary'] = block.corDeDestaque;
  return v as CSSProperties;
}

/** Devolve o bloco ao tema: apaga as três cores de uma vez. */
export const VOLTAR_AO_TEMA: Pick<QuizBlock, 'corDeFundo' | 'corDoTexto' | 'corDeDestaque'> = {
  corDeFundo: undefined,
  corDoTexto: undefined,
  corDeDestaque: undefined,
};

/**
 * Cores já usadas no funil, para oferecer de volta em vez de redigitar o
 * hexadecimal. É o "Cores do documento" do inlead.
 */
export function coresDoDocumento(design: QuizDesign, blocks: QuizBlock[], steps: QuizStep[]): string[] {
  const todas = [
    design.primary, design.background, design.surface, design.text, design.muted,
    design.titleColor,
    ...blocks.flatMap((b) => [b.corDeFundo, b.corDoTexto, b.corDeDestaque]),
    ...steps.flatMap((s) => [s.design?.primary, s.design?.background, s.design?.surface, s.design?.text]),
    ...(design.savedColors ?? []),
  ];
  // Normaliza para não listar `#FFF` e `#ffffff` como cores diferentes.
  const vistas = new Map<string, string>();
  for (const c of todas) {
    if (typeof c !== 'string' || !c.trim()) continue;
    const chave = c.trim().toLowerCase();
    if (!vistas.has(chave)) vistas.set(chave, c.trim());
  }
  return [...vistas.values()];
}
