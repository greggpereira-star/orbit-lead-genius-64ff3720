import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Um número com o peso que ele merece.
 *
 * Lido das duas referências que o cliente mandou: nelas o dado é a maior coisa
 * da tela e os acessórios dele recuam — `$422,525` com o `.82` em cinza-claro,
 * `$20,670` com o `USD` pequeno ao lado. É o oposto do que fazíamos, onde o
 * valor tinha o mesmo peso do rótulo e da variação.
 *
 * `tabular-nums` não é detalhe: numa coluna de métricas, dígitos de largura
 * variável fazem os números dançarem a cada atualização.
 */
export function NumeroHeroi({
  valor, acessorio, rotulo, nota, tamanho = 'medio', className,
}: {
  /** O número. Já formatado — este componente não decide casa decimal. */
  valor: ReactNode;
  /** Unidade, moeda ou centavos. Recua um grau. */
  acessorio?: ReactNode;
  /** O que o número conta. Vem acima, pequeno. */
  rotulo?: ReactNode;
  /** Variação, período, origem. Vem abaixo. */
  nota?: ReactNode;
  /** `grande` para o indicador principal de uma tela; `medio` para os demais. */
  tamanho?: 'medio' | 'grande';
  className?: string;
}) {
  // Valor em dinheiro com 5 dígitos ("R$ 125.000") não cabia no card estreito e era
  // cortado em "R$ 1…", sem aviso: o número mais importante da tela lido pela metade.
  // Agora o tamanho cai um degrau quando o texto é longo, e o valor inteiro fica no
  // `title`. O `truncate` continua como último recurso, nunca como primeira resposta.
  const texto = typeof valor === 'string' || typeof valor === 'number' ? String(valor) : undefined;
  const longo = (texto?.length ?? 0) > 9;
  return (
    <div className={cn('min-w-0', className)}>
      {rotulo && (
        <div className="flex items-center gap-1.5 text-xs leading-snug text-muted-foreground">
          {rotulo}
        </div>
      )}
      <div
        className={cn(
          'mt-1 flex items-baseline gap-1.5 font-semibold tabular-nums tracking-[-0.025em]',
          tamanho === 'grande'
            ? longo ? 'text-[26px] leading-[1.1]' : 'text-[32px] leading-[1.1]'
            : longo ? 'text-[20px] leading-[1.15]' : 'text-[26px] leading-[1.15]',
        )}
      >
        <span className="truncate" title={texto}>{valor}</span>
        {acessorio && (
          <span className="shrink-0 text-[0.55em] font-medium text-muted-foreground">
            {acessorio}
          </span>
        )}
      </div>
      {nota && <div className="mt-1 text-xs leading-snug text-muted-foreground">{nota}</div>}
    </div>
  );
}
