import { useRef, useState } from 'react';

interface Props {
  beforeUrl: string;
  afterUrl: string;
  radius?: number;
}

export function BeforeAfterSlider({ beforeUrl, afterUrl, radius = 12 }: Props) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);

  const move = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(0, Math.min(100, p)));
  };

  return (
    <div
      ref={ref}
      className="relative w-full aspect-video overflow-hidden select-none cursor-ew-resize"
      style={{ borderRadius: radius }}
      onMouseMove={(e) => e.buttons === 1 && move(e.clientX)}
      onMouseDown={(e) => move(e.clientX)}
      onTouchMove={(e) => move(e.touches[0].clientX)}
    >
      {afterUrl && <img src={afterUrl} alt="depois" className="absolute inset-0 w-full h-full object-cover" draggable={false} />}
      {beforeUrl && (
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <img
            src={beforeUrl}
            alt="antes"
            className="absolute inset-0 h-full object-cover"
            style={{ width: ref.current?.offsetWidth ?? '100%', maxWidth: 'none' }}
            draggable={false}
          />
        </div>
      )}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-white shadow-lg flex items-center justify-center text-black text-xs font-bold">
          ⇔
        </div>
      </div>
      <div className="absolute top-2 left-2 px-2 py-1 rounded bg-black/60 text-white text-[10px] font-semibold">ANTES</div>
      <div className="absolute top-2 right-2 px-2 py-1 rounded bg-black/60 text-white text-[10px] font-semibold">DEPOIS</div>
    </div>
  );
}
