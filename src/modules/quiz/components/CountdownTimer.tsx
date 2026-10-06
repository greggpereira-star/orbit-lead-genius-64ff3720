import { useEffect, useRef, useState } from "react";
import { alvoDoContador, restanteDoContador, jaPodeAparecer } from "../lib/contador";

interface Props {
  endsAt?: string;
  minutes?: number;
  color: string;
  /** "Mostrar após": segundos de espera antes de aparecer e começar a contar. */
  delaySeconds?: number;
  /** No canvas o atraso é ignorado — senão o bloco somem da tela de edição. */
  ignorarAtraso?: boolean;
}

export function CountdownTimer({
  endsAt,
  minutes = 15,
  color,
  delaySeconds = 0,
  ignorarAtraso = false,
}: Props) {
  /* O alvo é fixado UMA vez, na montagem. Antes era recalculado a cada render
     com `Date.now()`, e como o `now` do estado vinha do mesmo instante a
     diferença dava sempre igual: o contador mostrava 15:00 e nunca descia.
     Só andava quando `countdownEndsAt` estava preenchido — e o bloco da paleta
     nasce sem ele, então o padrão era um cronômetro parado. */
  const montadoEm = useRef(Date.now());
  const [alvo] = useState(() => alvoDoContador(montadoEm.current, endsAt, minutes));
  const [agora, setAgora] = useState(() => montadoEm.current);

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!ignorarAtraso && !jaPodeAparecer(montadoEm.current, agora, delaySeconds)) return null;

  const { horas, minutos, segundos } = restanteDoContador(alvo, agora);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex gap-2 justify-center">
      {[
        { v: pad(horas), l: "h" },
        { v: pad(minutos), l: "min" },
        { v: pad(segundos), l: "seg" },
      ].map((u) => (
        // Sem min-width fixo: um Container pode encaixar este bloco numa coluna
        // bem estreita (lado a lado com outro componente) — sem um piso rígido,
        // o box encolhe até o tamanho mínimo do próprio conteúdo (2 dígitos) em
        // vez de vazar/cortar. Numa etapa normal (largura sobrando), o resultado
        // visual é o mesmo de antes, já que o conteúdo já pedia ~64px mesmo.
        <div
          key={u.l}
          className="px-2 py-2 rounded-lg text-center min-w-0"
          style={{ background: color, color: "#fff" }}
        >
          <div className="text-xl font-bold tabular-nums">{u.v}</div>
          <div className="text-[10px] opacity-80">{u.l}</div>
        </div>
      ))}
    </div>
  );
}
