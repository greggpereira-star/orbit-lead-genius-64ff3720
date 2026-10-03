import type { ReactNode } from 'react';

/**
 * A trilha de propriedades do registro.
 *
 * É a forma que um CRM tem e que nenhuma das duas tentativas anteriores
 * acertou: três colunas iguais deram ruído, porque nada liderava; uma coluna
 * só deu página de configuração, porque dado estruturado e trabalho ficaram no
 * mesmo ritmo. Aqui eles se separam — a trilha é densa e sempre igual, a área
 * ao lado é onde se lê e se age.
 */
export function TrilhaDeProps({ children }: { children: ReactNode }) {
  return (
    <aside className="space-y-5 border-b bg-muted/30 px-5 py-6 md:border-b-0 md:border-r">
      {children}
    </aside>
  );
}

/** Um agrupamento dentro da trilha. O título é discreto: ele classifica, não anuncia. */
export function GrupoDeProps({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-medium text-muted-foreground/70">{titulo}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

/**
 * Uma propriedade: nome em cima, valor embaixo.
 *
 * Empilhado e não lado a lado porque a trilha tem 288px — um rótulo ao lado
 * comeria metade da largura e o valor cairia em duas linhas. Em coluna larga a
 * escolha seria a oposta.
 */
export function Prop({
  rotulo, children, acao,
}: {
  rotulo: string;
  children: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="group/prop">
      <p className="text-[11px] leading-tight text-muted-foreground">{rotulo}</p>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{children}</div>
        {/* Copiar aparece no hover: sempre visível, um ícone por linha
            competiria com os próprios dados numa coluna estreita. */}
        {acao && (
          <div className="shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/prop:opacity-100">
            {acao}
          </div>
        )}
      </div>
    </div>
  );
}

/** Valor que pode faltar. O vazio diz o que é, não um travessão. */
export function ValorOuVazio({ valor, vazio }: { valor: string | null; vazio: string }) {
  if (!valor) return <span className="font-normal text-muted-foreground">{vazio}</span>;
  return <span className="block truncate" title={valor}>{valor}</span>;
}

/**
 * Um bloco da área de trabalho: título discreto, ação à direita, conteúdo.
 *
 * Sem borda nem fundo — a separação entre blocos é o espaço, e a moldura já
 * vem da própria divisão entre trilha e área.
 */
export function BlocoDeTrabalho({
  titulo, acao, children,
}: {
  titulo: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Fato verificável do cadastro, na faixa de leitura rápida. */
export function FatoRapido({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] leading-tight text-muted-foreground">{rotulo}</p>
      <p className="truncate text-sm font-semibold tabular-nums" title={valor}>{valor}</p>
    </div>
  );
}
