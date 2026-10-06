import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Mic } from "lucide-react";
import type { QuizDesign } from "../types";
import { withAlpha, getContrastText } from "../lib/color";
import { formatarTempo, barrasDaOnda, barrasTocadas, type EstiloDeAudio } from "../lib/audio";

interface Props {
  src: string;
  estilo?: EstiloDeAudio;
  /** Quem fala. Vazio = esconde a linha, em vez de mostrar rótulo vazio. */
  nome?: string;
  fotoUrl?: string;
  design: Pick<QuizDesign, "primary" | "surface" | "text" | "muted" | "radius">;
}

/**
 * Player de áudio do quiz, nos três estilos que o inlead documenta:
 * padrão, mensagem de voz (direct) e escuro.
 *
 * Controle próprio em vez de `<audio controls>` porque o nativo é cinza, muda
 * de desenho em cada navegador e ignora o tema do funil — num quiz cuja página
 * inteira foi escolhida cor a cor, ele aparece como corpo estranho.
 *
 * O elemento `<audio>` continua existindo, sem `controls`: é ele que toca.
 */
export function AudioPlayer({ src, estilo = "padrao", nome, fotoUrl, design }: Props) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [duracao, setDuracao] = useState<number | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const aoTempo = () => setAtual(el.currentTime);
    const aoCarregar = () => setDuracao(el.duration);
    const aoTerminar = () => {
      setTocando(false);
      setAtual(0);
    };
    el.addEventListener("timeupdate", aoTempo);
    el.addEventListener("loadedmetadata", aoCarregar);
    el.addEventListener("ended", aoTerminar);
    return () => {
      el.removeEventListener("timeupdate", aoTempo);
      el.removeEventListener("loadedmetadata", aoCarregar);
      el.removeEventListener("ended", aoTerminar);
    };
  }, [src]);

  const alternar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
      setTocando(true);
    } else {
      el.pause();
      setTocando(false);
    }
  }, []);

  const escuro = estilo === "escuro";
  const fundo = escuro ? "#14161c" : design.surface;
  const texto = escuro ? "#F1F5F9" : design.text;
  const apagado = escuro ? withAlpha("#F1F5F9", 0.55) : design.muted;

  const barras = barrasDaOnda(src || "sem-audio");
  const progresso = duracao ? atual / duracao : 0;
  const acesas = barrasTocadas(barras.length, progresso);
  const tempo = formatarTempo(tocando || atual > 0 ? atual : duracao);

  const Botao = (
    <button
      type="button"
      onClick={alternar}
      aria-label={tocando ? "Pausar áudio" : "Tocar áudio"}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95"
      style={{ background: design.primary, color: getContrastText(design.primary) }}
    >
      {tocando ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
    </button>
  );

  const Onda = (
    <div className="flex h-7 flex-1 items-center gap-[2px]" aria-hidden>
      {barras.map((altura, i) => (
        <span
          key={i}
          className="w-[3px] shrink-0 rounded-full transition-colors"
          style={{
            height: `${Math.round(altura * 100)}%`,
            background: i < acesas ? design.primary : withAlpha(texto, 0.22),
          }}
        />
      ))}
    </div>
  );

  // `preload="metadata"` e não `auto`: o funil pode ter vários áudios, e baixar
  // todos de uma vez atrasa a etapa inteira para um arquivo que talvez nem toque.
  const Elemento = <audio ref={ref} src={src} preload="metadata" className="hidden" />;

  if (estilo === "instagram") {
    return (
      <div className="flex items-center gap-2.5">
        {Elemento}
        <div className="relative shrink-0">
          {fotoUrl ? (
            <img
              src={fotoUrl}
              alt={nome ? `Foto de ${nome}` : "Foto de quem fala"}
              className="h-11 w-11 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: withAlpha(design.primary, 0.15), color: design.primary }}
            >
              <Mic className="h-5 w-5" />
            </div>
          )}
          <span
            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full"
            style={{ background: design.primary, color: getContrastText(design.primary) }}
            aria-hidden
          >
            <Mic className="h-2.5 w-2.5" />
          </span>
        </div>
        {/* Balão com o canto vivo do lado de quem fala, como no direct. */}
        <div
          className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5"
          style={{
            background: withAlpha(design.primary, 0.1),
            borderRadius: 18,
            borderBottomLeftRadius: 4,
          }}
        >
          {Botao}
          {Onda}
          <span className="shrink-0 text-[11px] tabular-nums" style={{ color: apagado }}>
            {tempo}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 px-3.5 py-3"
      style={{
        background: fundo,
        borderRadius: design.radius,
        border: `1px solid ${withAlpha(texto, escuro ? 0.14 : 0.1)}`,
      }}
    >
      {Elemento}
      {Botao}
      <div className="min-w-0 flex-1">
        {nome && (
          <p className="mb-1 truncate text-[13px] font-semibold" style={{ color: texto }}>
            {nome}
          </p>
        )}
        {Onda}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums" style={{ color: apagado }}>
        {tempo}
      </span>
    </div>
  );
}
