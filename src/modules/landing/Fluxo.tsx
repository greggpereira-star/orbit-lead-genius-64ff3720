import { motion, useReducedMotion } from "framer-motion";
import { FLUXO } from "./conteudo";
import { CURVA_DA_PAGINA } from "./efeitos";

/**
 * Do clique ao caixa: cinco nós ligados por uma linha que se desenha ao entrar
 * na tela, com um ponto percorrendo o caminho e o retorno da conversão.
 * Em tela estreita os nós empilham e a linha vira vertical.
 */
export function Fluxo() {
  const reduzido = useReducedMotion();
  const total = FLUXO.nos.length;
  return (
    <div>
      <ol className="relative grid gap-8 md:grid-cols-5 md:gap-5">
        {/* linha horizontal (desktop) */}
        <span aria-hidden className="absolute left-[10%] right-[10%] top-[22px] hidden h-px bg-white/10 md:block" />
        <motion.span
          aria-hidden
          className="absolute left-[10%] right-[10%] top-[22px] hidden h-px origin-left bg-gradient-to-r from-[#5B8CFF] via-[#5B8CFF] to-emerald-400 md:block"
          initial={reduzido ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: "-120px" }}
          transition={{ duration: 1.6, ease: CURVA_DA_PAGINA }}
        />
        {!reduzido && (
          <motion.span
            aria-hidden
            className="absolute top-[19px] hidden h-[7px] w-[7px] rounded-full bg-white shadow-[0_0_14px_3px_rgb(91_140_255/0.9)] md:block"
            initial={{ left: "10%", opacity: 0 }}
            animate={{ left: ["10%", "90%"], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
          />
        )}
        {FLUXO.nos.map((no, i) => (
          <motion.li
            key={no.titulo}
            className="relative flex gap-4 md:flex-col md:items-center md:gap-3 md:text-center"
            initial={reduzido ? false : { opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: i * 0.12, ease: CURVA_DA_PAGINA }}
          >
            {i < total - 1 && <span aria-hidden className="absolute left-[21px] top-12 h-[calc(100%-1rem)] w-px bg-white/10 md:hidden" />}
            <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-[#0B1226] font-mono text-sm font-semibold text-[#9DB8FF]">
              {i + 1}
            </span>
            <div>
              <p className="text-base font-semibold text-white">{no.titulo}</p>
              <p className="mt-1 text-sm text-white/55">{no.texto}</p>
            </div>
          </motion.li>
        ))}
      </ol>
      <motion.p
        className="mx-auto mt-14 flex w-fit items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-300"
        initial={reduzido ? false : { opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.9, ease: CURVA_DA_PAGINA }}
      >
        <span aria-hidden>↩</span> {FLUXO.retorno}
      </motion.p>
    </div>
  );
}
