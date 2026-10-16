import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Marca do ALT Leadflow: um "L" desenhado como o caminho do lead.
 * Ponto de origem (o clique) → traço que desce e dobra → ponto verde (a venda).
 * O verde só aparece como sinal de conversão. Fonte: public/brand/leadflow-mark.svg.
 */
export function Simbolo({ className }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("h-8 w-8 shrink-0", className)}>
      <defs>
        <linearGradient id={`${id}g`} x1="6" y1="0" x2="58" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6A97FF" /><stop offset="1" stopColor="#1F4FD8" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity=".22" /><stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="20" fill={`url(#${id}g)`} />
      <rect width="64" height="64" rx="20" fill={`url(#${id}s)`} />
      <circle cx="22" cy="16" r="6" fill="#fff" />
      <path d="M22 16v21a9 9 0 0 0 9 9h9" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
      <circle cx="46" cy="46" r="5.5" fill="#34D399" />
    </svg>
  );
}

export function Logo({ className, tamanho = "h-8 w-8" }: { className?: string; tamanho?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 whitespace-nowrap font-extrabold tracking-[-0.045em]", className)}>
      <Simbolo className={tamanho} />
      <span>Lead<span className="text-[#7FA6FF]">flow</span></span>
    </span>
  );
}
