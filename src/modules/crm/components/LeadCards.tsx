import type { ReactNode } from 'react';

/**
 * Uma seção da ficha.
 *
 * Separada por espaço, não por borda nem por caixa. A versão anterior tirou os
 * cartões mas devolveu uma linha divisória em cada campo — trocou quatro
 * molduras por quinze filetes, que é o mesmo ruído com outra forma.
 *
 * O título é frase, não caixa alta espaçada: micro-rótulo em versalete é o
 * recurso que toda tela de configuração usa, e aqui ele só gritava.
 */
export function SecaoFicha({
  rotulo, acao, children,
}: {
  rotulo: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-muted-foreground">{rotulo}</h3>
        {acao}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

/**
 * Uma linha de dado, alinhada por uma coluna fixa de rótulo.
 *
 * A coluna de 8,5rem é a espinha da ficha: todos os valores começam no mesmo
 * x, em qualquer seção. Antes o valor era alinhado à direita, e com rótulos de
 * larguras diferentes isso abria um vão irregular no meio de cada linha — o
 * olho perdia a coluna e cada dado parecia solto.
 */
export function LinhaFicha({
  rotulo, children, acao,
}: {
  rotulo: string;
  children: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="group/linha grid grid-cols-[8.5rem_minmax(0,1fr)] items-start gap-4">
      <span className="pt-px text-sm text-muted-foreground">{rotulo}</span>
      <div className="flex min-w-0 items-center gap-1">
        <div className="min-w-0 text-sm font-medium">{children}</div>
        {/* O botão de copiar só aparece no hover da linha: estando sempre
            visível, quinze ícones cinza competiam com os próprios dados. */}
        {acao && <div className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/linha:opacity-100">{acao}</div>}
      </div>
    </div>
  );
}

/** Valor que pode faltar. O vazio diz o que é, não um travessão. */
export function ValorOuVazio({ valor, vazio }: { valor: string | null; vazio: string }) {
  if (!valor) return <span className="font-normal text-muted-foreground">{vazio}</span>;
  return <span className="block truncate" title={valor}>{valor}</span>;
}
