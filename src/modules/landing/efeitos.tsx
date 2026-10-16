import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from "framer-motion";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Efeitos da página inicial. Toda animação respeita `prefers-reduced-motion`:
 * quem pediu menos movimento recebe a página parada, com o mesmo conteúdo.
 */

const CURVA = [0.22, 1, 0.36, 1] as const;

/** Entra suave quando aparece na tela (uma vez só). */
export function Revelar({
  children,
  atraso = 0,
  y = 24,
  className,
  ...resto
}: { children: ReactNode; atraso?: number; y?: number; className?: string } & Omit<HTMLMotionProps<"div">, "children">) {
  const reduzido = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduzido ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.7, delay: atraso, ease: CURVA }}
      {...resto}
    >
      {children}
    </motion.div>
  );
}

/** Barra fina no topo que acompanha a rolagem da página. */
export function ProgressoDeRolagem() {
  const { scrollYProgress } = useScroll();
  const escala = useSpring(scrollYProgress, { stiffness: 140, damping: 24, mass: 0.2 });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX: escala }}
      className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-[#5B8CFF]"
    />
  );
}

/** Luz que segue o ponteiro, desenhada por CSS (variáveis --mx/--my). */
export function useHolofote<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const quadro = useRef<number | null>(null);
  const reduzido = useReducedMotion();
  const aoMover = (e: PointerEvent<T>) => {
    if (reduzido || e.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const { clientX, clientY } = e;
    if (quadro.current) cancelAnimationFrame(quadro.current);
    quadro.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${clientX - r.left}px`);
      el.style.setProperty("--my", `${clientY - r.top}px`);
    });
  };
  useEffect(() => () => { if (quadro.current) cancelAnimationFrame(quadro.current); }, []);
  return { ref, aoMover };
}

/** Inclina o conteúdo de leve na direção do ponteiro. */
export function Inclinar({ children, grau = 5, className }: { children: ReactNode; grau?: number; className?: string }) {
  const reduzido = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rx = useSpring(useTransform(y, [-0.5, 0.5], [grau, -grau]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(x, [-0.5, 0.5], [-grau, grau]), { stiffness: 120, damping: 18 });
  const aoMover = (e: PointerEvent<HTMLDivElement>) => {
    if (reduzido || e.pointerType === "touch") return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - r.left) / r.width - 0.5);
    y.set((e.clientY - r.top) / r.height - 0.5);
  };
  const sair = () => { x.set(0); y.set(0); };
  return (
    <div style={{ perspective: 1400 }} onPointerMove={aoMover} onPointerLeave={sair} className={className}>
      <motion.div style={reduzido ? undefined : { rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}>{children}</motion.div>
    </div>
  );
}

/** Troca uma palavra a cada `intervalo` ms. Parado (primeira palavra) com movimento reduzido. */
export function PalavraGiratoria({ palavras, intervalo = 2400, className }: { palavras: readonly string[]; intervalo?: number; className?: string }) {
  const reduzido = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduzido || palavras.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % palavras.length), intervalo);
    return () => clearInterval(t);
  }, [reduzido, palavras.length, intervalo]);
  return (
    <span className={cn("relative inline-block align-bottom", className)}>
      {/* texto invisível reserva a largura da maior palavra: sem pulo de layout */}
      <span aria-hidden className="invisible">{[...palavras].sort((a, b) => b.length - a.length)[0]}</span>
      <span className="sr-only">{palavras[0]}</span>
      <motion.span
        key={palavras[i]}
        aria-hidden
        initial={reduzido ? false : { opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.5, ease: CURVA }}
        className="absolute inset-0 whitespace-nowrap"
      >
        {palavras[i]}
      </motion.span>
    </span>
  );
}

/** Faixa que corre sem parar. Para ao passar o ponteiro e para de vez com movimento reduzido. */
export function Faixa({ itens }: { itens: readonly string[] }) {
  const dobro = [...itens, ...itens];
  return (
    <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]" aria-label={itens.join(", ")}>
      <ul aria-hidden className="landing-faixa flex w-max gap-3 py-1 motion-reduce:animate-none">
        {dobro.map((t, i) => (
          <li key={i} className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 font-mono text-[13px] text-white/70">{t}</li>
        ))}
      </ul>
    </div>
  );
}

export const CURVA_DA_PAGINA = CURVA;
