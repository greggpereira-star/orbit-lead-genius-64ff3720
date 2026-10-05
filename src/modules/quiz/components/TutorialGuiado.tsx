import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  posicaoDoCartao,
  faixasDoVeu,
  type PosicaoDoCartao,
  type Retangulo,
} from "../lib/tutorialPosicao";

export interface PassoDoTutorial {
  /** Valor de `data-tutorial` no elemento a destacar. Sem alvo = cartão central. */
  alvo?: string;
  titulo: string;
  texto: string;
}

const CARTAO = { width: 320, height: 176 };

/**
 * Passo a passo guiado do construtor, na primeira vez.
 *
 * Duas decisões que valem registro:
 *
 * 1. Só roda em tela larga. O painel de componentes é `hidden lg:block`, então
 *    em telas menores os alvos NÃO EXISTEM no DOM e o tutorial apontaria para o
 *    vazio. Melhor não aparecer do que apontar errado.
 * 2. Passo cujo alvo não está no DOM é pulado, não mostrado. Os elementos do
 *    construtor aparecem e desaparecem conforme o estado (o botão "Publicar
 *    alterações" só existe quando há mudança pendente), e um cartão descrevendo
 *    um botão invisível é pior do que um passo a menos.
 */
export function TutorialGuiado({
  passos,
  onFechar,
}: {
  passos: PassoDoTutorial[];
  onFechar: () => void;
}) {
  const [i, setI] = useState(0);
  const [alvo, setAlvo] = useState<Retangulo | null>(null);
  /* Três estados, e não dois: `undefined` é "ainda não medi este passo", `null`
     é "medi e o alvo não está no DOM". Com só dois, o efeito que pula alvo
     ausente lia o `null` inicial do mesmo render em que a medição ainda nem
     tinha sido aplicada, e o tutorial abria direto no passo 3. */
  const [pos, setPos] = useState<PosicaoDoCartao | null | undefined>(undefined);
  const refCartao = useRef<HTMLDivElement | null>(null);
  const medido = useRef(false);
  const [janela, setJanela] = useState({ width: 0, height: 0 });

  const passo = passos[i];
  const ultimo = i === passos.length - 1;

  const medir = useCallback(() => {
    if (!passo) return;
    medido.current = true;
    const janela = { width: window.innerWidth, height: window.innerHeight };
    setJanela(janela);
    if (!passo.alvo) {
      setAlvo(null);
      setPos(posicaoDoCartao({ top: 0, left: 0, width: 0, height: 0 }, CARTAO, janela));
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tutorial="${passo.alvo}"]`);
    if (!el) {
      setAlvo(null);
      setPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const ret: Retangulo = { top: r.top, left: r.left, width: r.width, height: r.height };
    setAlvo(ret);
    setPos(
      posicaoDoCartao(
        ret,
        { width: CARTAO.width, height: refCartao.current?.offsetHeight ?? CARTAO.height },
        janela,
      ),
    );
  }, [passo]);

  useLayoutEffect(() => {
    medido.current = false;
    setPos(undefined);
    medir();
  }, [medir]);

  useEffect(() => {
    /* O alvo pode nem existir ainda quando o passo entra — o construtor monta em
       etapas. Uma remedida no quadro seguinte resolve sem ficar em laço. */
    const t = window.setTimeout(medir, 60);
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [medir]);

  const avancar = useCallback(() => {
    if (ultimo) onFechar();
    else setI((v) => v + 1);
  }, [ultimo, onFechar]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
      if (e.key === "ArrowRight") avancar();
      if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [avancar, onFechar]);

  // Passo com alvo ausente: pula adiante em vez de mostrar cartão solto.
  useEffect(() => {
    if (passo?.alvo && pos === null && medido.current) {
      if (ultimo) onFechar();
      else setI((v) => v + 1);
    }
  }, [passo, pos, ultimo, onFechar]);

  if (!passo || !pos) return null;

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial do construtor"
    >
      {/* Véu em quatro faixas ao redor do alvo, e não uma `box-shadow` com
          espalhamento gigante: aquela versão não pintava com alvo alto, e
          medi-la de perto só rendeu um comportamento de compositor difícil de
          prever. Quatro retângulos sempre pintam, e a conta tem teste. */}
      {alvo ? (
        <>
          {faixasDoVeu(alvo, janela).map((f, n) => (
            <div
              key={n}
              className="absolute bg-black/55"
              style={{ top: f.top, left: f.left, width: f.width, height: f.height }}
            />
          ))}
          <div
            className="pointer-events-none absolute rounded-lg ring-2 ring-primary transition-all duration-200 motion-reduce:transition-none"
            style={{
              top: alvo.top - 4,
              left: alvo.left - 4,
              width: alvo.width + 8,
              height: alvo.height + 8,
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-black/55" />
      )}

      <div
        ref={refCartao}
        className="absolute w-80 rounded-xl border bg-card p-4 shadow-2xl"
        style={{ top: pos.top, left: pos.left }}
      >
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar tutorial"
          className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          Passo {i + 1} de {passos.length}
        </p>
        <h3 className="mt-1 pr-6 text-sm font-bold">{passo.titulo}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{passo.texto}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex gap-1" aria-hidden>
            {passos.map((_, n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all ${n === i ? "w-4 bg-primary" : "w-1.5 bg-muted"}`}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            {i > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setI((v) => v - 1)}>
                Voltar
              </Button>
            )}
            <Button size="sm" onClick={avancar}>
              {ultimo ? "Entendi" : "Próximo"}
            </Button>
          </div>
        </div>

        {!ultimo && (
          <button
            type="button"
            onClick={onFechar}
            className="mt-2 text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Pular o tutorial
          </button>
        )}
      </div>
    </div>
  );
}
