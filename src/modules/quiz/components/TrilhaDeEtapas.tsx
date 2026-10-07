import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { ResumoDaEtapa } from "../lib/trilhaDeEtapas";
import { rolagemParaCentralizar } from "../lib/trilhaDeEtapas";

/**
 * Navegação entre as telas do quiz, no topo do canvas.
 *
 * Substitui a fila de pontos. A régua de pontos media 306px para 24 etapas:
 * cada alvo tinha 12px de largura — metade do mínimo de 24px da WCAG 2.5.8 —,
 * nenhum deles dizia o que era, e o único texto da faixa ("Etapa 1 de 24 ·
 * Entrada emocional") ficava deslocado à direita das setas, longe do ponto que
 * descrevia. Montar um funil de 24 telas assim é acertar a etapa por sorte.
 *
 * O cartão carrega as três coisas que decidem o próximo movimento de quem
 * monta: o NOME da tela, QUANTOS componentes ela tem (zero é um buraco no
 * funil) e a CONVERSÃO medida, quando há visitantes suficientes para afirmar
 * alguma coisa. Com isso a faixa deixa de ser enfeite e vira o instrumento de
 * leitura do funil inteiro.
 */

/* 180px de cartão não é número redondo: é o que os nomes PEDEM.
   Medido nos 24 nomes do funil do cliente, com a fonte e o peso reais do
   cartão: mediana 105px, p90 123px, máximo 128px ("Histórico com estética").
   O cartão de 136px deixava 96px para o nome e cortava até a mediana — com
   isso "Detalhe da reg…" e "Desejo emocio…" ficavam indistinguíveis, que é
   justamente o que a trilha existe para resolver. Caber menos cartão na tela
   é melhor do que caber mais cartão ilegível. Os 12px a mais sobre os 168
   anteriores são o chip do ícone, que entrou à esquerda do número. */
const LARGURA_DO_CARTAO = 180;

interface Props {
  etapas: ResumoDaEtapa[];
  /** Ícone por etapa, do primeiro bloco dela — mesmo da lista lateral. */
  icones?: Record<string, React.ComponentType<{ className?: string }>>;
  etapaAtualId: string | null;
  onEscolher: (stepId: string) => void;
  /** Ausente na tela de Design, onde a trilha só mostra — não constrói. */
  onAdicionar?: () => void;
}

export function TrilhaDeEtapas({ etapas, icones, etapaAtualId, onEscolher, onAdicionar }: Props) {
  const pistaRef = useRef<HTMLDivElement | null>(null);
  const cartaoAtualRef = useRef<HTMLButtonElement | null>(null);
  /* Esmaecimento só do lado que REALMENTE continua. Fixo nos dois lados, ele
     escurecia o primeiro cartão com a trilha já no começo — sugerindo conteúdo
     que não existe e sujando o cartão selecionado. */
  const [sobra, setSobra] = useState({ antes: false, depois: false });

  const medirSobra = useCallback(() => {
    const p = pistaRef.current;
    if (!p) return;
    setSobra({
      antes: p.scrollLeft > 2,
      depois: p.scrollLeft + p.clientWidth < p.scrollWidth - 2,
    });
  }, []);

  const indiceAtual = etapas.findIndex((e) => e.id === etapaAtualId);
  const atual = indiceAtual >= 0 ? indiceAtual : 0;

  /* `useLayoutEffect` e não `useEffect`: centralizar depois da pintura faz a
     trilha aparecer no lugar errado e corrigir num salto visível. */
  useLayoutEffect(() => {
    const pista = pistaRef.current;
    const cartao = cartaoAtualRef.current;
    if (!pista || !cartao) return;
    pista.scrollTo({
      left: rolagemParaCentralizar({
        inicioDoAlvo: cartao.offsetLeft,
        larguraDoAlvo: cartao.offsetWidth,
        larguraVisivel: pista.clientWidth,
        larguraTotal: pista.scrollWidth,
      }),
      behavior: "smooth",
    });
    medirSobra();
  }, [etapaAtualId, etapas.length, medirSobra]);

  useEffect(() => {
    const p = pistaRef.current;
    if (!p) return;
    medirSobra();
    p.addEventListener("scroll", medirSobra, { passive: true });
    const observador = new ResizeObserver(medirSobra);
    observador.observe(p);
    return () => {
      p.removeEventListener("scroll", medirSobra);
      observador.disconnect();
    };
  }, [medirSobra, etapas.length]);

  const irPara = useCallback(
    (i: number) => {
      const alvo = etapas[i];
      if (alvo) onEscolher(alvo.id);
    },
    [etapas, onEscolher],
  );

  /* Setas do teclado percorrem a trilha quando ela tem o foco, que é o que um
     `tablist` promete a quem navega sem mouse. */
  const aoTeclar = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        irPara(Math.min(atual + 1, etapas.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        irPara(Math.max(atual - 1, 0));
      } else if (e.key === "Home") {
        e.preventDefault();
        irPara(0);
      } else if (e.key === "End") {
        e.preventDefault();
        irPara(etapas.length - 1);
      }
    },
    [atual, etapas.length, irPara],
  );

  // Rolar a trilha com a roda vertical do mouse: ela é horizontal, e sem isto
  // quem não tem trackpad fica preso às setas.
  useEffect(() => {
    const pista = pistaRef.current;
    if (!pista) return;
    const naRoda = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (pista.scrollWidth <= pista.clientWidth) return;
      e.preventDefault();
      pista.scrollLeft += e.deltaY;
    };
    pista.addEventListener("wheel", naRoda, { passive: false });
    return () => pista.removeEventListener("wheel", naRoda);
  }, []);

  if (etapas.length === 0) return null;

  const seta = (direcao: -1 | 1, Icone: typeof ChevronLeft, rotulo: string) => {
    const destino = atual + direcao;
    const inativa = destino < 0 || destino >= etapas.length;
    return (
      <button
        type="button"
        onClick={() => irPara(destino)}
        disabled={inativa}
        aria-label={rotulo}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:pointer-events-none disabled:opacity-20"
      >
        <Icone className="h-4 w-4" />
      </button>
    );
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2.5">
      {/* A contagem vem ANTES da trilha, encostada nela: é o rótulo do que vem
          a seguir, e não um comentário solto no fim da faixa. */}
      <span className="shrink-0 pl-1 pr-1 text-[11px] font-medium tabular-nums text-white/45">
        {atual + 1}
        <span className="text-white/25">/{etapas.length}</span>
      </span>

      {seta(-1, ChevronLeft, "Etapa anterior")}

      <div className="relative min-w-0 flex-1">
        <div
          ref={pistaRef}
          role="tablist"
          aria-label="Etapas do quiz"
          tabIndex={0}
          onKeyDown={aoTeclar}
          className="trilha-etapas flex items-stretch gap-2 overflow-x-auto scroll-smooth rounded-lg py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          {etapas.map((e, i) => {
            const selecionada = i === atual;
            const Icone = icones?.[e.id];
            return (
              <button
                key={e.id}
                type="button"
                role="tab"
                aria-selected={selecionada}
                tabIndex={-1}
                ref={selecionada ? cartaoAtualRef : undefined}
                onClick={() => onEscolher(e.id)}
                title={e.titulo}
                style={{ width: LARGURA_DO_CARTAO }}
                className={`group relative flex min-h-[66px] shrink-0 scroll-mx-2 flex-col justify-center gap-1.5 overflow-hidden rounded-xl py-2.5 pl-3.5 pr-3 text-left transition-colors ${
                  selecionada
                    ? "bg-white text-neutral-900"
                    : "bg-white/[0.06] text-white/75 hover:bg-white/[0.12] hover:text-white"
                } ${e.natureza === "vazia" && !selecionada ? "ring-1 ring-inset ring-amber-400/35" : ""}`}
              >
                {/* Marca de natureza na BORDA, de alto a baixo — e em todas as
                    etapas, não só em captura e resultado. Varrendo a trilha com
                    o olho, a sequência de cores desenha a forma do funil: onde
                    pergunta, onde prova, onde pede contato, onde entrega. A
                    versão anterior marcava duas naturezas com 3px no meio do
                    cartão e o resto de nada. */}
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-[3px]"
                  style={{ background: e.tinta }}
                />

                <span className="flex items-center gap-2">
                  {/* Ícone do primeiro bloco, o mesmo da lista lateral: é o
                      identificador mais rápido que existe — reconhecido antes
                      de qualquer palavra ser lida. */}
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                    style={{
                      background: selecionada ? `${e.tinta}2E` : `${e.tinta}24`,
                      color: selecionada ? undefined : e.tinta,
                    }}
                  >
                    {Icone ? (
                      <Icone className="h-3 w-3" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <span
                    /* /50 e não /35: medido no cartão renderizado, 35% de
                       alfa dava 3,25:1 sobre o fundo do cartão — abaixo do
                       piso de 4,5:1 para 10px. */
                    className={`shrink-0 text-[10px] font-bold tabular-nums ${
                      selecionada ? "text-neutral-500" : "text-white/50"
                    }`}
                  >
                    {String(e.numero).padStart(2, "0")}
                  </span>
                  {e.percentual !== null && (
                    <span
                      className="ml-auto shrink-0 rounded px-1 text-[10px] font-bold tabular-nums"
                      style={{
                        color: e.cor ?? undefined,
                        background: selecionada ? "transparent" : `${e.cor}1F`,
                      }}
                    >
                      {e.percentual}%
                    </span>
                  )}
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold leading-[1.3]">
                    {e.nome}
                  </span>
                  {/* O QUE a etapa é, não QUANTAS peças tem.
                      "1 comp." aparecia em 14 das 24 etapas deste funil: a
                      linha existia e não distinguia 58% dos cartões. */}
                  <span
                    /* Esta linha é o IDENTIFICADOR da etapa, não um rodapé:
                       a 40% de alfa saía com 3,82:1, abaixo do piso. */
                    className={`block truncate text-[10px] leading-[1.4] ${
                      selecionada ? "text-neutral-600" : "text-white/55"
                    }`}
                  >
                    {e.rotuloDaNatureza}
                    {e.componentes > 1 && ` · ${e.componentes} itens`}
                  </span>
                </span>
              </button>
            );
          })}

          {onAdicionar && (
            <button
              type="button"
              onClick={onAdicionar}
              title="Adicionar uma etapa no fim do funil"
              className="flex min-h-[66px] w-[46px] shrink-0 items-center justify-center rounded-xl border border-dashed border-white/20 text-white/45 transition-colors hover:border-white/40 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <Plus className="h-4 w-4" />
              <span className="sr-only">Nova etapa</span>
            </button>
          )}
        </div>

        {/* Esmaecimento nas bordas: diz que a trilha continua, sem ocupar a
            linha com uma barra de rolagem. */}
        {sobra.antes && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#0a0a0a] to-transparent"
          />
        )}
        {sobra.depois && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#0a0a0a] to-transparent"
          />
        )}
      </div>

      {seta(1, ChevronRight, "Próxima etapa")}
    </div>
  );
}
