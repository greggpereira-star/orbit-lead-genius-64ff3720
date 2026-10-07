import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { ResumoDaEtapa, NaturezaDaEtapa } from "../lib/trilhaDeEtapas";
import { ROTULO_DA_NATUREZA, rolagemParaCentralizar } from "../lib/trilhaDeEtapas";

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

const TINTA_DA_NATUREZA: Record<NaturezaDaEtapa, string> = {
  vazia: "#F59E0B",
  captura: "#38BDF8",
  resultado: "#34D399",
  percurso: "transparent",
};

interface Props {
  etapas: ResumoDaEtapa[];
  etapaAtualId: string | null;
  onEscolher: (stepId: string) => void;
  /** Ausente na tela de Design, onde a trilha só mostra — não constrói. */
  onAdicionar?: () => void;
}

export function TrilhaDeEtapas({ etapas, etapaAtualId, onEscolher, onAdicionar }: Props) {
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
    <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
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
          className="trilha-etapas flex items-stretch gap-1.5 overflow-x-auto scroll-smooth rounded-lg py-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          {etapas.map((e, i) => {
            const selecionada = i === atual;
            const tinta = TINTA_DA_NATUREZA[e.natureza];
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
                className={`group relative flex min-h-[38px] w-[136px] shrink-0 scroll-mx-2 flex-col justify-center gap-0.5 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                  selecionada
                    ? "bg-white text-neutral-900"
                    : "bg-white/[0.07] text-white/70 hover:bg-white/[0.14] hover:text-white"
                } ${e.natureza === "vazia" && !selecionada ? "ring-1 ring-inset ring-amber-400/35" : ""}`}
              >
                <span className="flex items-center gap-1.5">
                  {/* Barrinha de natureza: onde está a captura e onde está o
                      resultado, legível sem ler. Percurso não ganha cor — se
                      tudo é marcado, nada é. */}
                  {tinta !== "transparent" && (
                    <span
                      aria-hidden
                      className="h-2.5 w-[3px] shrink-0 rounded-full"
                      style={{ background: tinta }}
                    />
                  )}
                  <span
                    className={`shrink-0 text-[10px] font-bold tabular-nums ${
                      selecionada ? "text-neutral-400" : "text-white/35"
                    }`}
                  >
                    {String(e.numero).padStart(2, "0")}
                  </span>
                  <span className="truncate text-[11.5px] font-semibold leading-tight">
                    {e.nome}
                  </span>
                </span>
                <span
                  className={`flex items-center gap-1 pl-[1px] text-[10px] leading-tight ${
                    selecionada ? "text-neutral-500" : "text-white/35"
                  }`}
                >
                  <span className="truncate">
                    {e.componentes === 0 ? ROTULO_DA_NATUREZA.vazia : `${e.componentes} comp.`}
                  </span>
                  {e.percentual !== null && (
                    <span
                      className="ml-auto shrink-0 rounded px-1 font-bold tabular-nums"
                      style={{
                        color: e.cor ?? undefined,
                        background: selecionada ? "transparent" : `${e.cor}1F`,
                      }}
                    >
                      {e.percentual}%
                    </span>
                  )}
                </span>
              </button>
            );
          })}

          {onAdicionar && (
            <button
              type="button"
              onClick={onAdicionar}
              title="Adicionar uma etapa no fim do funil"
              className="flex min-h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-dashed border-white/20 text-white/45 transition-colors hover:border-white/40 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
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
