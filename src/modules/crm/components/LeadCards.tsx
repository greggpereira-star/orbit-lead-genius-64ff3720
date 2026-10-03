import type { ReactNode } from 'react';

/** Assunto do bloco. A cor do disco é semântica — não existe disco decorativo. */
/**
 * Três tratamentos, não cinco cores.
 *
 * `neutro` é o padrão. `alerta` existe porque perda é ESTADO e estado merece
 * cor. `acento` é o azul da marca, reservado para o bloco em que a tela quer
 * que o olho pare primeiro — um por tela.
 */
export type Assunto = 'neutro' | 'alerta' | 'acento';

const DISCO: Record<Assunto, string> = {
  neutro: 'disco',
  alerta: 'disco disco-alerta',
  acento: 'disco disco-acento',
};

/**
 * Cartão da ficha.
 *
 * Branco sobre a superfície tonal do modal — a inversão que faz a profundidade
 * existir. As quatro tentativas anteriores faziam o contrário, cartão quase
 * branco sobre fundo branco, e por isso liam como chapadas por mais que se
 * mexesse nas colunas.
 */
export function CartaoFicha({
  icone, titulo, descricao, assunto = 'neutro', acao, children,
}: {
  icone: ReactNode;
  titulo: string;
  descricao?: string;
  assunto?: Assunto;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="cartao">
      <div className="cartao-topo">
        <span className={DISCO[assunto]} aria-hidden="true">{icone}</span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-tight tracking-[-0.01em]">
            {titulo}
          </h3>
          {descricao && (
            <p className="truncate text-[11px] leading-tight text-muted-foreground" title={descricao}>
              {descricao}
            </p>
          )}
        </div>
        {acao && <div className="ml-auto shrink-0">{acao}</div>}
      </div>
      <div className="cartao-corpo">{children}</div>
    </section>
  );
}

/** Atalho de cabeçalho de cartão. Discreto de propósito: leva, não compete. */
export function LinkDoCartao({ children, aoClicar }: { children: ReactNode; aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="rounded text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}

/**
 * Uma propriedade do registro: rótulo pequeno em cima, valor embaixo.
 *
 * Empilhado porque a coluna de propriedades tem 336px — rótulo ao lado comeria
 * metade da largura e jogaria e-mail e empreendimento para duas linhas.
 */
export function PropFicha({
  icone, rotulo, children, acao,
}: {
  icone?: ReactNode;
  rotulo: string;
  children: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="group/prop flex items-start gap-2.5">
      {icone && (
        <span className="mt-0.5 shrink-0 text-muted-foreground/60" aria-hidden="true">{icone}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] leading-snug text-muted-foreground">{rotulo}</p>
        <div className="mt-px text-[13px] font-medium leading-snug">{children}</div>
      </div>
      {/* Copiar aparece no hover: um ícone fixo por linha competiria com os
          próprios dados numa coluna estreita. */}
      {acao && (
        <div className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/prop:opacity-100">
          {acao}
        </div>
      )}
    </div>
  );
}

/** Valor que pode faltar. O vazio diz o que é — e, quando dá, o que fazer. */
export function ValorOuVazio({ valor, vazio }: { valor: string | null; vazio: string }) {
  if (!valor) return <span className="font-normal text-muted-foreground">{vazio}</span>;
  return <span className="block truncate" title={valor}>{valor}</span>;
}

/** Número verificável do cadastro, na faixa de leitura rápida. */
export function FatoRapido({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] leading-snug text-muted-foreground">{rotulo}</p>
      <p className="truncate text-[17px] font-semibold tracking-[-0.02em] tabular-nums" title={valor}>
        {valor}
      </p>
    </div>
  );
}
