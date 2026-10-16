import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  CHAMADA_FINAL,
  COMO_COMECA,
  HERO,
  INTRO_PERGUNTAS,
  LINK_ENTRAR_NA_FILA,
  LINK_FALAR_COM_A_ALT,
  NAVEGACAO,
  PERGUNTAS,
  RODAPE,
  WHATSAPP_EM_LIBERACAO,
} from "./conteudo";
import { FichaDoLead, TelaAtendimento, TelaFunil, TelaOrigem, TelaRegras } from "./Telas";

const FOCO =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--superficie-tonal)]";

function Selo({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-[color-mix(in_oklch,var(--primary)_12%,transparent)] px-3 py-1 text-xs font-semibold text-primary">
      {children}
    </span>
  );
}

function BotaoLink({
  href,
  children,
  tipo = "primario",
  externo = true,
}: {
  href: string;
  children: ReactNode;
  tipo?: "primario" | "fantasma" | "claro";
  externo?: boolean;
}) {
  const classe = cn(
    "inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-semibold transition-colors",
    FOCO,
    tipo === "primario" && "bg-primary text-primary-foreground hover:bg-primary/90",
    tipo === "fantasma" && "border-[1.5px] border-border text-foreground hover:bg-muted",
    tipo === "claro" && "border-[1.5px] border-white/80 text-white hover:bg-white/10",
  );
  return externo ? (
    <a href={href} target="_blank" rel="noreferrer" className={classe}>
      {children}
    </a>
  ) : (
    <Link to={href} className={classe}>
      {children}
    </Link>
  );
}

const TELAS = [
  <TelaOrigem key="o" />,
  <TelaAtendimento key="a" />,
  <TelaRegras key="r" />,
  <TelaFunil key="f" />,
];

export function PaginaInicial() {
  return (
    <div className="min-h-screen bg-[var(--superficie-tonal)] text-foreground">
      <a
        href="#conteudo"
        className={cn(
          "sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2",
          FOCO,
        )}
      >
        Pular para o conteúdo
      </a>

      <header className="mx-auto flex max-w-[1296px] flex-wrap items-center gap-x-8 gap-y-4 px-6 py-6">
        <Link
          to="/"
          className={cn("flex items-center gap-2.5 rounded-xl", FOCO)}
          aria-label="ALT Leadflow, página inicial"
        >
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-foreground text-[15px] font-bold tracking-tighter text-background"
          >
            alt
          </span>
          <span className="text-lg font-semibold tracking-tight">ALT Leadflow</span>
        </Link>
        <nav
          aria-label="Seções da página"
          className="order-3 flex w-full gap-6 overflow-x-auto text-[15px] font-medium text-foreground/65 md:order-none md:ml-6 md:w-auto md:gap-9"
        >
          {NAVEGACAO.map((n) => (
            <a
              key={n.ancora}
              href={n.ancora}
              className={cn("whitespace-nowrap rounded-md hover:text-foreground", FOCO)}
            >
              {n.rotulo}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <Link
            to="/login"
            className={cn(
              "rounded-full border-[1.5px] border-border px-5 py-2.5 text-sm font-semibold hover:bg-muted",
              FOCO,
            )}
          >
            Entrar
          </Link>
          <a
            href={LINK_FALAR_COM_A_ALT}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90",
              FOCO,
            )}
          >
            Falar com a ALT
          </a>
        </div>
      </header>

      <main id="conteudo">
        <section
          aria-labelledby="titulo-hero"
          className="mx-auto grid max-w-[1296px] items-center gap-12 px-6 pb-20 pt-10 lg:grid-cols-[1fr_520px] lg:gap-16 lg:pb-28 lg:pt-16"
        >
          <div className="flex flex-col gap-6">
            <Selo>{HERO.selo}</Selo>
            <h1
              id="titulo-hero"
              className="text-[44px] font-bold leading-[1.05] tracking-[-0.045em] sm:text-[60px] lg:text-[76px] lg:leading-[1.04]"
            >
              {HERO.titulo}
            </h1>
            <p className="max-w-[34rem] text-[17px] leading-relaxed text-foreground/70 sm:text-xl">
              {HERO.subtitulo}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <BotaoLink href={LINK_FALAR_COM_A_ALT}>Falar com a ALT</BotaoLink>
              <BotaoLink href="/login" tipo="fantasma" externo={false}>
                Já sou cliente: entrar
              </BotaoLink>
            </div>
            <p className="text-sm text-foreground/60">{HERO.nota}</p>
          </div>
          <FichaDoLead />
        </section>

        <section
          id="perguntas"
          aria-labelledby="titulo-perguntas"
          className="mx-auto max-w-[1296px] scroll-mt-6 px-6"
        >
          <div className="flex flex-col gap-4 pb-4 pt-6">
            <Selo>{INTRO_PERGUNTAS.selo}</Selo>
            <h2
              id="titulo-perguntas"
              className="max-w-3xl text-[32px] font-bold leading-[1.15] tracking-[-0.05em] sm:text-5xl sm:leading-[1.1]"
            >
              {INTRO_PERGUNTAS.titulo}
            </h2>
          </div>
          <ol>
            {PERGUNTAS.map((p, i) => (
              <li
                key={p.numero}
                className="grid items-center gap-8 py-10 lg:grid-cols-2 lg:gap-[72px] lg:py-12"
              >
                <div className={cn("flex flex-col gap-4", i % 2 === 1 && "lg:order-2")}>
                  <p
                    aria-hidden
                    className="text-xl font-semibold tabular-nums tracking-wider text-primary"
                  >
                    {p.numero}
                  </p>
                  <h3 className="text-[30px] font-bold leading-[1.15] tracking-[-0.05em] sm:text-[44px] sm:leading-[1.12]">
                    {p.pergunta}
                  </h3>
                  <p className="text-base leading-[1.6] text-foreground/70 sm:text-[19px]">
                    {p.resposta}
                  </p>
                  <p className="text-sm font-medium sm:text-[15px]">{p.nota}</p>
                </div>
                <div className={cn(i % 2 === 1 && "lg:order-1")}>{TELAS[i]}</div>
              </li>
            ))}
          </ol>
        </section>

        <section
          id="whatsapp"
          aria-labelledby="titulo-whatsapp"
          className="mx-auto max-w-[1296px] scroll-mt-6 px-6 py-10"
        >
          <div className="flex flex-col gap-6 rounded-[20px] bg-[var(--aviso-suave)] p-7 sm:p-9 lg:flex-row lg:items-center lg:gap-10">
            <div className="flex flex-1 flex-col gap-3">
              <span className="inline-flex w-fit rounded-full bg-card px-3 py-1 text-xs font-semibold text-[var(--aviso)]">
                {WHATSAPP_EM_LIBERACAO.selo}
              </span>
              <h2
                id="titulo-whatsapp"
                className="text-2xl font-bold tracking-[-0.04em] sm:text-[28px]"
              >
                {WHATSAPP_EM_LIBERACAO.titulo}
              </h2>
              <p className="text-base leading-relaxed text-[var(--aviso)] sm:text-[17px]">
                {WHATSAPP_EM_LIBERACAO.texto}
              </p>
            </div>
            <BotaoLink href={LINK_ENTRAR_NA_FILA}>{WHATSAPP_EM_LIBERACAO.botao}</BotaoLink>
          </div>
        </section>

        <section
          id="como-comeca"
          aria-labelledby="titulo-como"
          className="mx-auto max-w-[1296px] scroll-mt-6 px-6 pb-12 pt-16"
        >
          <h2
            id="titulo-como"
            className="mb-8 text-[32px] font-bold tracking-[-0.05em] sm:text-[44px]"
          >
            {COMO_COMECA.titulo}
          </h2>
          <ol className="grid gap-5 md:grid-cols-3">
            {COMO_COMECA.passos.map((p) => (
              <li
                key={p.numero}
                className="flex flex-col gap-3.5 rounded-[20px] bg-card p-7 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_14px_28px_-16px_rgb(15_23_42/0.18)]"
              >
                <span
                  aria-hidden
                  className="text-[56px] font-bold leading-none tracking-[-0.06em] text-primary"
                >
                  {p.numero}
                </span>
                <h3 className="text-xl font-semibold leading-snug tracking-[-0.03em]">
                  {p.titulo}
                </h3>
                <p className="text-base leading-relaxed text-foreground/70">{p.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="titulo-final" className="mx-auto max-w-[1296px] px-6 pb-20 pt-10">
          <div className="flex flex-col items-center gap-7 rounded-[28px] bg-foreground px-6 py-12 text-center text-background sm:px-16 sm:py-[72px]">
            <h2
              id="titulo-final"
              className="max-w-3xl text-[32px] font-bold leading-[1.15] tracking-[-0.05em] sm:text-[52px] sm:leading-[1.1]"
            >
              {CHAMADA_FINAL.titulo}
            </h2>
            <p className="max-w-2xl text-base leading-relaxed text-background/75 sm:text-[19px]">
              {CHAMADA_FINAL.texto}
            </p>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <BotaoLink href={LINK_FALAR_COM_A_ALT}>Falar com a ALT</BotaoLink>
              <BotaoLink href="/login" tipo="claro" externo={false}>
                Já sou cliente: entrar
              </BotaoLink>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1296px] flex-col gap-8 px-6 pb-14 pt-2 sm:flex-row sm:justify-between">
        <div className="space-y-2">
          <p className="text-lg font-semibold tracking-tight">ALT Leadflow</p>
          <p className="text-sm leading-relaxed text-foreground/65">
            {RODAPE.empresa}
            <br />
            {RODAPE.cnpj}
          </p>
        </div>
        <ul className="space-y-2 text-sm font-medium">
          {RODAPE.links.map((l) => (
            <li key={l.para}>
              <Link to={l.para} className={cn("rounded-md hover:underline", FOCO)}>
                {l.rotulo}
              </Link>
            </li>
          ))}
          <li>
            <a href={`mailto:${RODAPE.contato}`} className={cn("rounded-md hover:underline", FOCO)}>
              {RODAPE.contato}
            </a>
          </li>
        </ul>
      </footer>
    </div>
  );
}
