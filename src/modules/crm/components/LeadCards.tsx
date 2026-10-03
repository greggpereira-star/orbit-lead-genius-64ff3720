import type { ReactNode } from 'react';

/**
 * Uma seção da ficha, em coluna única.
 *
 * Sem borda e sem fundo: o que separa é o espaço e um rótulo pequeno. A versão
 * anterior empilhava cartão dentro de cartão dentro de campo — quatro bordas
 * disputando a mesma informação, e um disco de ícone repetido nove vezes como
 * enfeite. Tirar as caixas devolve o ar que fazia falta.
 *
 * O rótulo em caixa alta nomeia a categoria do dado, que é uma distinção real
 * no conteúdo — não um enfeite estrutural.
 */
export function SecaoFicha({
  rotulo, acao, children,
}: {
  rotulo: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {rotulo}
        </h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/**
 * Uma linha de dado: nome à esquerda, valor à direita.
 *
 * Rótulo ao lado e não acima porque numa coluna única a largura sobra, e o
 * olho que varre uma lista de pares procura a coluna da esquerda. Acima,
 * cada dado ocuparia o dobro da altura sem ganhar nada.
 */
export function LinhaFicha({
  rotulo, children, acao,
}: {
  rotulo: string;
  children: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="shrink-0 pt-px text-sm text-muted-foreground">{rotulo}</span>
      <div className="flex min-w-0 items-center gap-1.5 text-right">
        <div className="min-w-0 text-sm font-medium">{children}</div>
        {acao}
      </div>
    </div>
  );
}

/** Valor que pode faltar. O vazio diz o que é, não um travessão. */
export function ValorOuVazio({ valor, vazio }: { valor: string | null; vazio: string }) {
  if (!valor) return <span className="font-normal text-muted-foreground">{vazio}</span>;
  return <span className="block truncate" title={valor}>{valor}</span>;
}
