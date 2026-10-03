import type { ReactNode } from 'react';

/**
 * O cartão da ficha do lead.
 *
 * Um só componente para as duas abas: título com ícone em disco, subtítulo
 * opcional e uma ação à direita. Cartões desenhados caso a caso divergem no
 * espaçamento e no peso do título, e a tela passa a parecer montada por
 * pessoas diferentes.
 */
export function CartaoFicha({
  icone, titulo, descricao, acao, children, tom = 'neutro', className = '',
}: {
  icone: ReactNode;
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
  children: ReactNode;
  /** `alerta` para o que exige decisão — motivo de perda, pendência. */
  tom?: 'neutro' | 'alerta';
  className?: string;
}) {
  return (
    <section
      className={`flex flex-col rounded-xl border bg-card p-4 ${
        tom === 'alerta' ? 'border-destructive/25 bg-destructive/[0.03]' : ''
      } ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              tom === 'alerta' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
            }`}
            aria-hidden="true"
          >
            {icone}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold">{titulo}</h3>
            {descricao && (
              <p className="truncate text-xs text-muted-foreground" title={descricao}>{descricao}</p>
            )}
          </div>
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  );
}

/**
 * Uma linha de dado dentro do cartão: rótulo pequeno em cima, valor embaixo.
 *
 * O rótulo acima e não ao lado porque os valores aqui têm larguras muito
 * diferentes — e-mail longo e cidade curta na mesma coluna — e rótulo lateral
 * obrigaria a reservar a mesma faixa para todos.
 */
export function DadoDaFicha({
  icone, rotulo, children, acoes,
}: {
  icone?: ReactNode;
  rotulo: string;
  children: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      {icone && <span className="mt-4 shrink-0 text-muted-foreground/70" aria-hidden="true">{icone}</span>}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-muted-foreground">{rotulo}</p>
        <div className="min-w-0 text-sm font-medium">{children}</div>
      </div>
      {acoes && <div className="mt-3 flex shrink-0 items-center gap-1">{acoes}</div>}
    </div>
  );
}

/** Texto de dado que pode faltar — o vazio diz o que fazer, não "—". */
export function ValorOuVazio({ valor, vazio }: { valor: string | null; vazio: string }) {
  if (!valor) return <span className="font-normal text-muted-foreground">{vazio}</span>;
  return <span className="block truncate" title={valor}>{valor}</span>;
}
