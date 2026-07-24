import { useEffect, useState } from 'react';

interface Props {
  endsAt?: string;
  minutes?: number;
  color: string;
}

export function CountdownTimer({ endsAt, minutes = 15, color }: Props) {
  const target = endsAt ? new Date(endsAt).getTime() : Date.now() + minutes * 60_000;
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, target - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <div className="flex gap-2 justify-center">
      {[
        { v: pad(h), l: 'h' },
        { v: pad(m), l: 'min' },
        { v: pad(s), l: 'seg' },
      ].map((u) => (
        // Sem min-width fixo: um Container pode encaixar este bloco numa coluna
        // bem estreita (lado a lado com outro componente) — sem um piso rígido,
        // o box encolhe até o tamanho mínimo do próprio conteúdo (2 dígitos) em
        // vez de vazar/cortar. Numa etapa normal (largura sobrando), o resultado
        // visual é o mesmo de antes, já que o conteúdo já pedia ~64px mesmo.
        <div
          key={u.l}
          className="px-2 py-2 rounded-lg text-center min-w-0"
          style={{ background: color, color: '#fff' }}
        >
          <div className="text-xl font-bold tabular-nums">{u.v}</div>
          <div className="text-[10px] opacity-80">{u.l}</div>
        </div>
      ))}
    </div>
  );
}
