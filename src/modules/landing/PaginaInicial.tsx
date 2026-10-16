import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "framer-motion";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  CHAMADA_FINAL,
  COMO_COMECA,
  FAIXA_DE_INTEGRACOES,
  HERO,
  LINK_ENTRAR_NA_FILA,
  LINK_FALAR_COM_A_ALT,
  NAVEGACAO,
  PALAVRAS_DO_HERO,
  PARA_QUEM,
  PERGUNTAS_FREQUENTES,
  PROBLEMA,
  FLUXO,
  RECURSOS,
  RECURSOS_INTRO,
  RODAPE,
  WHATSAPP_EM_LIBERACAO,
} from "./conteudo";
import { Faixa, Inclinar, PalavraGiratoria, ProgressoDeRolagem, Revelar, useHolofote } from "./efeitos";
import { Fluxo } from "./Fluxo";
import { Logo } from "./Logo";
import { TELAS_POR_RECURSO, TelaDoHeroi } from "./Telas";

const FOCO = "outline-none focus-visible:ring-2 focus-visible:ring-[#9DB8FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#070C1B]";
const CONTAINER = "mx-auto w-full max-w-[1200px] px-6 sm:px-10";

function Selo({ children, tom = "azul" }: { children: ReactNode; tom?: "azul" | "verde" }) {
  return (
    <span className={cn("inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]",
      tom === "azul" ? "border-[#5B8CFF]/30 bg-[#5B8CFF]/10 text-[#9DB8FF]" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-300")}>
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", tom === "azul" ? "bg-[#5B8CFF]" : "bg-emerald-400")} />{children}
    </span>
  );
}

function Botao({ href, children, tipo = "primario", externo = true }: { href: string; children: ReactNode; tipo?: "primario" | "fantasma"; externo?: boolean }) {
  const classe = cn(
    "inline-flex min-h-14 items-center justify-center gap-2 rounded-full px-8 text-[15px] font-semibold transition-all duration-200",
    FOCO,
    tipo === "primario"
      ? "bg-[#2F6BFF] text-white shadow-[0_10px_30px_-8px_rgb(47_107_255/0.8)] hover:-translate-y-0.5 hover:bg-[#4A7FFF]"
      : "border border-white/15 text-white/90 hover:border-white/30 hover:bg-white/5",
  );
  if (externo) return <a href={href} target="_blank" rel="noopener noreferrer" className={classe}>{children}</a>;
  return <Link to={href} className={classe}>{children}</Link>;
}

function Topo() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#070C1B]/75 backdrop-blur-xl">
      <div className={cn(CONTAINER, "flex h-16 items-center justify-between gap-4")}>
        <a href="#topo" className={cn("flex items-center rounded-lg text-white", FOCO)}>
          <Logo className="text-[19px]" />
        </a>
        <nav aria-label="Seções da página" className="hidden items-center gap-1 lg:flex">
          {NAVEGACAO.map((n) => (
            <a key={n.ancora} href={n.ancora} className={cn("rounded-full px-4 py-2 text-sm text-white/65 transition-colors hover:text-white", FOCO)}>{n.rotulo}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/login" className={cn("whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium text-white/80 hover:text-white", FOCO)}>Entrar</Link>
          <a href={LINK_FALAR_COM_A_ALT} target="_blank" rel="noopener noreferrer" className={cn("hidden min-h-11 items-center whitespace-nowrap rounded-full bg-white px-5 text-sm font-semibold text-[#0E172C] hover:bg-white/90 sm:inline-flex", FOCO)}>Falar com a ALT</a>
        </div>
      </div>
    </header>
  );
}

function Heroi() {
  const { ref, aoMover } = useHolofote<HTMLElement>();
  return (
    <section id="topo" ref={ref} onPointerMove={aoMover} className="relative overflow-hidden pb-32 pt-20 md:pt-32">
      <div aria-hidden className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.04)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_50%_0%,#000,transparent_72%)]" />
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#2F6BFF]/25 blur-[120px]" />
      <div aria-hidden className="pointer-events-none absolute inset-0 [background:radial-gradient(420px_circle_at_var(--mx,50%)_var(--my,20%),rgb(91_140_255/0.14),transparent_70%)]" />
      <div className={cn(CONTAINER, "relative")}>
        <div className="mx-auto max-w-[860px] text-center">
          <Revelar><Selo>{HERO.selo}</Selo></Revelar>
          <Revelar atraso={0.08}>
            <h1 className="mt-6 text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.035em] text-white sm:text-6xl md:text-[4.25rem]">
              {HERO.tituloA}<br />
              <span className="bg-gradient-to-r from-[#7FA6FF] via-[#5B8CFF] to-[#9DB8FF] bg-clip-text text-transparent">{HERO.tituloB}</span>
            </h1>
          </Revelar>
          <Revelar atraso={0.16}>
            <p className="mx-auto mt-6 max-w-[640px] text-lg leading-relaxed text-white/65">{HERO.subtitulo}</p>
          </Revelar>
          <Revelar atraso={0.22}>
            <p className="mt-5 font-mono text-sm text-white/45">
              Lead perdido <span className="text-[#9DB8FF]"><PalavraGiratoria palavras={PALAVRAS_DO_HERO} /></span>
            </p>
          </Revelar>
          <Revelar atraso={0.28} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Botao href={LINK_FALAR_COM_A_ALT}>{HERO.cta} <span aria-hidden>→</span></Botao>
            <Botao href="/login" tipo="fantasma" externo={false}>{HERO.ctaSecundario}</Botao>
          </Revelar>
          <Revelar atraso={0.34}><p className="mt-4 text-xs text-white/40">{HERO.micro}</p></Revelar>
        </div>
        <Revelar atraso={0.4} y={40} className="mx-auto mt-20 max-w-[1040px]">
          <Inclinar grau={3}><TelaDoHeroi /></Inclinar>
        </Revelar>
        <div className="mt-24"><Faixa itens={FAIXA_DE_INTEGRACOES} /></div>
      </div>
    </section>
  );
}

function Cabecalho({ selo, titulo, subtitulo, tom }: { selo: string; titulo: string; subtitulo?: string; tom?: "azul" | "verde" }) {
  return (
    <Revelar className="mx-auto max-w-[760px] text-center">
      <Selo tom={tom}>{selo}</Selo>
      <h2 className="mt-5 text-3xl font-extrabold leading-[1.1] tracking-[-0.03em] text-white sm:text-5xl">{titulo}</h2>
      {subtitulo && <p className="mt-4 text-lg text-white/60">{subtitulo}</p>}
    </Revelar>
  );
}

function Problema() {
  return (
    <section id="problema" className="scroll-mt-20 py-28 md:py-40">
      <div className={CONTAINER}>
        <Cabecalho selo={PROBLEMA.selo} titulo={PROBLEMA.titulo} subtitulo={PROBLEMA.subtitulo} />
        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {PROBLEMA.itens.map((it, i) => (
            <Revelar key={it.titulo} atraso={i * 0.1}>
              <article className="h-full rounded-[40px] border border-white/10 bg-white/[0.03] p-10 transition-colors hover:border-rose-400/30 hover:bg-rose-400/[0.04]">
                <span aria-hidden className="font-mono text-xs text-rose-300/80">0{i + 1} / vazamento</span>
                <h3 className="mt-4 text-xl font-bold text-white">{it.titulo}</h3>
                <p className="mt-3 leading-relaxed text-white/60">{it.texto}</p>
              </article>
            </Revelar>
          ))}
        </div>
      </div>
    </section>
  );
}

function Solucao() {
  return (
    <section className="py-28 md:py-40">
      <div className={CONTAINER}>
        <Cabecalho selo={FLUXO.selo} titulo={FLUXO.titulo} subtitulo={FLUXO.subtitulo} tom="verde" />
        <div className="mt-24"><Fluxo /></div>
      </div>
    </section>
  );
}

function Recursos() {
  return (
    <section id="recursos" className="scroll-mt-20 py-28 md:py-40">
      <div className={CONTAINER}>
        <Cabecalho selo={RECURSOS_INTRO.selo} titulo={RECURSOS_INTRO.titulo} />
        <div className="mt-28 space-y-32 md:space-y-48">
          {RECURSOS.map((r, i) => {
            const Tela = TELAS_POR_RECURSO[r.id];
            const invertido = i % 2 === 1;
            return (
              <article key={r.id} id={`recurso-${r.id}`} className="grid items-center gap-12 lg:grid-cols-2 lg:gap-24">
                <Revelar className={cn(invertido && "lg:order-2")}>
                  <Selo>{r.selo}</Selo>
                  <h3 className="mt-5 text-3xl font-extrabold leading-[1.1] tracking-[-0.03em] text-white sm:text-4xl">{r.titulo}</h3>
                  <p className="mt-4 text-lg leading-relaxed text-white/60">{r.texto}</p>
                  <ul className="mt-6 space-y-3">
                    {r.pontos.map((p) => (
                      <li key={p} className="flex gap-3 text-[15px] text-white/80"><span aria-hidden className="mt-0.5 text-emerald-400">✓</span>{p}</li>
                    ))}
                  </ul>
                </Revelar>
                <Revelar atraso={0.1} y={32} className={cn("min-w-0", invertido && "lg:order-1")}>
                  <Inclinar grau={2.5}>{Tela?.()}</Inclinar>
                </Revelar>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WhatsAppOficial() {
  return (
    <section id="whatsapp" className="scroll-mt-20 py-28 md:py-40">
      <div className={CONTAINER}>
        <Revelar>
          <div className="relative overflow-hidden rounded-[40px] border border-emerald-400/20 bg-gradient-to-br from-emerald-400/[0.08] via-white/[0.02] to-transparent p-8 sm:p-16 md:p-20">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/10 blur-[90px]" />
            <div className="relative max-w-[720px]">
              <Selo tom="verde">{WHATSAPP_EM_LIBERACAO.selo}</Selo>
              <h2 className="mt-5 text-3xl font-extrabold leading-[1.1] tracking-[-0.03em] text-white sm:text-5xl">{WHATSAPP_EM_LIBERACAO.titulo}</h2>
              <p className="mt-5 text-lg leading-relaxed text-white/65">{WHATSAPP_EM_LIBERACAO.texto}</p>
              <p className="mt-4 text-sm text-white/45">{WHATSAPP_EM_LIBERACAO.requisito}</p>
              <div className="mt-8"><Botao href={LINK_ENTRAR_NA_FILA}>{WHATSAPP_EM_LIBERACAO.botao} <span aria-hidden>→</span></Botao></div>
            </div>
          </div>
        </Revelar>
      </div>
    </section>
  );
}

function ParaQuem() {
  return (
    <section className="py-28 md:py-40">
      <div className={CONTAINER}>
        <Cabecalho selo={PARA_QUEM.selo} titulo={PARA_QUEM.titulo} />
        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PARA_QUEM.itens.map((it, i) => (
            <Revelar key={it.titulo} atraso={i * 0.08}>
              <article className="h-full rounded-[40px] border border-white/10 bg-white/[0.03] p-8">
                <h3 className="text-lg font-bold text-white">{it.titulo}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-white/60">{it.texto}</p>
              </article>
            </Revelar>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComoComeca() {
  return (
    <section className="py-28 md:py-40">
      <div className={CONTAINER}>
        <Cabecalho selo={COMO_COMECA.selo} titulo={COMO_COMECA.titulo} />
        <ol className="mt-20 grid gap-4 md:grid-cols-3">
          {COMO_COMECA.passos.map((p, i) => (
            <Revelar key={p.numero} atraso={i * 0.1}>
              <li className="h-full rounded-[40px] border border-white/10 bg-white/[0.03] p-10">
                <span className="font-mono text-4xl font-bold text-[#5B8CFF]">{p.numero}</span>
                <h3 className="mt-4 text-xl font-bold text-white">{p.titulo}</h3>
                <p className="mt-2 leading-relaxed text-white/60">{p.texto}</p>
              </li>
            </Revelar>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Pergunta({ pergunta, resposta }: { pergunta: string; resposta: string }) {
  const [aberta, setAberta] = useState(false);
  const reduzido = useReducedMotion();
  return (
    <div className="rounded-[40px] border border-white/10 bg-white/[0.03]">
      <h3>
        <button type="button" aria-expanded={aberta} onClick={() => setAberta((v) => !v)} className={cn("flex w-full items-center justify-between gap-4 rounded-[40px] px-8 py-6 text-left text-base font-semibold text-white", FOCO)}>
          {pergunta}
          <span aria-hidden className={cn("font-mono text-xl text-[#9DB8FF] transition-transform", aberta && "rotate-45")}>+</span>
        </button>
      </h3>
      <motion.div initial={false} animate={{ height: aberta ? "auto" : 0, opacity: aberta ? 1 : 0 }} transition={{ duration: reduzido ? 0 : 0.3 }} className="overflow-hidden" aria-hidden={!aberta}>
        <p className="px-8 pb-6 leading-relaxed text-white/65">{resposta}</p>
      </motion.div>
    </div>
  );
}

function Perguntas() {
  return (
    <section id="perguntas" className="scroll-mt-20 py-28 md:py-40">
      <div className="mx-auto w-full max-w-[820px] px-6 sm:px-10">
        <Cabecalho selo={PERGUNTAS_FREQUENTES.selo} titulo={PERGUNTAS_FREQUENTES.titulo} />
        <div className="mt-16 space-y-4">
          {PERGUNTAS_FREQUENTES.itens.map((p) => <Pergunta key={p.pergunta} {...p} />)}
        </div>
      </div>
    </section>
  );
}

function ChamadaFinal() {
  return (
    <section className="py-28 md:py-40">
      <div className={CONTAINER}>
        <Revelar>
          <div className="relative overflow-hidden rounded-[40px] border border-[#5B8CFF]/25 bg-gradient-to-br from-[#2F6BFF]/25 via-[#2F6BFF]/[0.06] to-transparent px-6 py-20 text-center sm:px-16 md:py-28">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-56 w-[70%] rounded-full bg-[#5B8CFF]/30 blur-[100px]" />
            <h2 className="relative mx-auto max-w-[760px] text-3xl font-extrabold leading-[1.1] tracking-[-0.03em] text-white sm:text-5xl">{CHAMADA_FINAL.titulo}</h2>
            <p className="relative mx-auto mt-5 max-w-[560px] text-lg text-white/65">{CHAMADA_FINAL.texto}</p>
            <div className="relative mt-12 flex justify-center"><Botao href={LINK_FALAR_COM_A_ALT}>{HERO.cta} <span aria-hidden>→</span></Botao></div>
          </div>
        </Revelar>
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="border-t border-white/[0.06] py-12">
      <div className={cn(CONTAINER, "flex flex-col gap-8 md:flex-row md:justify-between")}>
        <div className="space-y-1 text-sm text-white/55">
          <Logo className="text-[19px] text-white" />
          <p>{RODAPE.empresa}</p>
          <p>{RODAPE.cnpj}</p>
          <p><a href={`mailto:${RODAPE.contato}`} className={cn("rounded underline-offset-4 hover:text-white hover:underline", FOCO)}>{RODAPE.contato}</a></p>
        </div>
        <nav aria-label="Informações legais" className="flex flex-col gap-2 text-sm md:items-end">
          {RODAPE.links.map((l) => (
            <Link key={l.para} to={l.para} className={cn("rounded text-white/65 underline-offset-4 hover:text-white hover:underline", FOCO)}>{l.rotulo}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function PaginaInicial() {
  return (
    <div className="min-h-screen scroll-smooth bg-[#070C1B] font-sans text-white antialiased [color-scheme:dark]">
      <a href="#recursos" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-[#0E172C]">Ir para os recursos</a>
      <ProgressoDeRolagem />
      <Topo />
      <main>
        <Heroi />
        <Problema />
        <Solucao />
        <Recursos />
        <WhatsAppOficial />
        <ParaQuem />
        <ComoComeca />
        <Perguntas />
        <ChamadaFinal />
      </main>
      <Rodape />
    </div>
  );
}
