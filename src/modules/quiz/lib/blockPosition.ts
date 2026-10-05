import type { CSSProperties } from 'react';
import type { QuizBlock } from '../types';

export type Posicao = NonNullable<QuizBlock['posicao']>;
export type Ancora = NonNullable<QuizBlock['ancora']>;

export const POSICOES: { valor: Posicao; rotulo: string; ajuda: string }[] = [
  { valor: 'fluxo', rotulo: 'No fluxo', ajuda: 'Empilhado com os outros blocos da etapa' },
  { valor: 'topo-fixo', rotulo: 'Fixo no topo', ajuda: 'Colado no alto da janela, acompanha a rolagem' },
  { valor: 'rodape-fixo', rotulo: 'Fixo no rodapé', ajuda: 'Colado embaixo — bom para o botão de ação' },
  { valor: 'flutuante', rotulo: 'Flutuante', ajuda: 'Solto num canto da janela' },
  { valor: 'tela-cheia', rotulo: 'Tela inteira', ajuda: 'Ocupa a janela toda, por cima do resto' },
];

export const ANCORAS: { valor: Ancora; rotulo: string }[] = [
  { valor: 'topo-esquerda', rotulo: 'Topo à esquerda' },
  { valor: 'topo-centro', rotulo: 'Topo ao centro' },
  { valor: 'topo-direita', rotulo: 'Topo à direita' },
  { valor: 'centro-esquerda', rotulo: 'Centro à esquerda' },
  { valor: 'centro-direita', rotulo: 'Centro à direita' },
  { valor: 'abaixo-esquerda', rotulo: 'Abaixo à esquerda' },
  { valor: 'abaixo-centro', rotulo: 'Abaixo ao centro' },
  { valor: 'abaixo-direita', rotulo: 'Abaixo à direita' },
];

export const estaNoFluxo = (b: QuizBlock) => (b.posicao ?? 'fluxo') === 'fluxo';

/**
 * Estilo do bloco tirado do fluxo.
 *
 * `position: fixed` e não `sticky`: sticky só gruda enquanto o contêiner que o
 * envolve está em vista, e aqui o contêiner é a própria coluna da etapa — o
 * elemento descolaria ao fim dela, que é justamente quando ele mais precisa
 * estar visível.
 *
 * A largura acompanha a do conteúdo para a barra não ficar mais larga que o
 * funil num monitor grande.
 */
export function estiloDaPosicao(block: QuizBlock, larguraDoConteudo: number): CSSProperties | undefined {
  const pos = block.posicao ?? 'fluxo';
  if (pos === 'fluxo') return undefined;

  const base: CSSProperties = { position: 'fixed', zIndex: 30 };

  if (pos === 'tela-cheia') {
    return { ...base, inset: 0, zIndex: 40, overflow: 'auto' };
  }
  if (pos === 'topo-fixo' || pos === 'rodape-fixo') {
    return {
      ...base,
      left: '50%',
      transform: 'translateX(-50%)',
      width: '100%',
      maxWidth: larguraDoConteudo,
      ...(pos === 'topo-fixo' ? { top: 0 } : { bottom: 0 }),
    };
  }

  // Flutuante: o canto manda. 16px de folga para não colar na borda, e
  // `max-width` para o bloco não atravessar a tela num celular estreito.
  const a = block.ancora ?? 'abaixo-direita';
  const [vertical, horizontal] = a.split('-') as ['topo' | 'centro' | 'abaixo', 'esquerda' | 'centro' | 'direita'];
  const estilo: CSSProperties = { ...base, maxWidth: 'calc(100vw - 32px)' };

  if (vertical === 'topo') estilo.top = 16;
  else if (vertical === 'abaixo') estilo.bottom = 16;
  else {
    estilo.top = '50%';
  }

  if (horizontal === 'esquerda') estilo.left = 16;
  else if (horizontal === 'direita') estilo.right = 16;
  else estilo.left = '50%';

  // As duas centralizações combinam numa transformação só.
  const tx = horizontal === 'centro' ? '-50%' : '0';
  const ty = vertical === 'centro' ? '-50%' : '0';
  if (tx !== '0' || ty !== '0') estilo.transform = `translate(${tx}, ${ty})`;

  return estilo;
}
