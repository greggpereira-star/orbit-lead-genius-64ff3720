import type { QuizBlock, QuizDesign } from "../types";
import { withAlpha } from "../lib/color";

/**
 * Blocos de conteúdo compartilhados entre o CANVAS e o PLAYER.
 *
 * Moraram dentro do `QuizPlayer`, e o resultado foi que o canvas não tinha
 * como desenhá-los: nove tipos de bloco caíam no `default` do construtor e
 * apareciam como um título solto, enquanto o quiz publicado mostrava o
 * componente de verdade. O autor só descobria depois de publicar.
 *
 * Uma implementação, dois consumidores — a mesma regra que o resolvedor de
 * estilo de bloco já segue, e pela mesma razão: dois lados desenhando por
 * conta própria divergem em uma semana.
 */

export function ItensDeConteudo({
  block,
  design,
  cartao,
}: {
  block: QuizBlock;
  design: QuizDesign;
  cartao: boolean;
}) {
  const itens = block.itens ?? [];
  if (!itens.length) return null;
  const colunas = block.colunas ?? 2;
  // 3 e 4 colunas caem para 2 no celular: em 448px, quatro itens dariam 100px
  // cada e o rótulo quebraria em todas as palavras.
  const grade =
    colunas === 2
      ? "grid-cols-2"
      : colunas === 3
        ? "grid-cols-2 sm:grid-cols-3"
        : "grid-cols-2 sm:grid-cols-4";

  return (
    <div className={`mb-6 grid gap-2.5 ${grade}`}>
      {itens.map((i) => {
        const conteudo = (
          <>
            {i.imageUrl ? (
              <img
                src={i.imageUrl}
                alt=""
                className={
                  cartao
                    ? "mb-2 aspect-video w-full rounded-md object-cover"
                    : "h-6 w-6 shrink-0 rounded object-cover"
                }
              />
            ) : i.emoji ? (
              <span
                className={cartao ? "mb-1 block text-2xl leading-none" : "shrink-0"}
                aria-hidden
              >
                {i.emoji}
              </span>
            ) : null}
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-tight">{i.titulo}</span>
              {cartao && i.texto && (
                <span className="mt-0.5 block text-xs opacity-70">{i.texto}</span>
              )}
            </span>
          </>
        );

        const estilo = {
          borderRadius: design.radius,
          background: cartao ? design.surface : "transparent",
          border: cartao ? `1px solid ${withAlpha(design.text, 0.1)}` : "none",
          color: design.text,
        } as const;

        const classe = cartao ? "block p-3 text-left" : "flex items-center gap-2 py-1.5 text-left";

        return i.url ? (
          <a
            key={i.id}
            href={i.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${classe} transition-opacity hover:opacity-80`}
            style={estilo}
          >
            {conteudo}
          </a>
        ) : (
          <div key={i.id} className={classe} style={estilo}>
            {conteudo}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Repete ao visitante o que ele respondeu.
 *
 * Mostra o RÓTULO da opção, não o id guardado: `o3` não diz nada a ninguém.
 * Sem resposta nenhuma ainda, o bloco não aparece — uma caixa vazia dizendo
 * "o que você nos contou" seria pior que nada.
 */
export function SumarioDasRespostas({
  block,
  design,
  resumo,
}: {
  block: QuizBlock;
  design: QuizDesign;
  resumo: { pergunta: string; resposta: string }[];
}) {
  const filtradas = block.resumirBlocos?.length
    ? resumo.filter((_, i) => block.resumirBlocos!.includes(String(i)))
    : resumo;

  if (!filtradas.length) return null;

  return (
    <div
      className="mb-6 divide-y overflow-hidden"
      style={{
        borderRadius: design.radius,
        background: design.surface,
        border: `1px solid ${withAlpha(design.text, 0.1)}`,
      }}
    >
      {filtradas.map((l, i) => (
        <div
          key={i}
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2"
        >
          <span className="text-xs opacity-60">{l.pergunta}</span>
          <span className="text-sm font-semibold">{l.resposta}</span>
        </div>
      ))}
    </div>
  );
}

const REDES: Record<
  NonNullable<QuizBlock["redes"]>[number]["rede"],
  { rotulo: string; prefixo: string }
> = {
  instagram: { rotulo: "Instagram", prefixo: "https://instagram.com/" },
  whatsapp: { rotulo: "WhatsApp", prefixo: "https://wa.me/" },
  facebook: { rotulo: "Facebook", prefixo: "https://facebook.com/" },
  youtube: { rotulo: "YouTube", prefixo: "https://youtube.com/" },
  tiktok: { rotulo: "TikTok", prefixo: "https://tiktok.com/@" },
  linkedin: { rotulo: "LinkedIn", prefixo: "https://linkedin.com/in/" },
  site: { rotulo: "Site", prefixo: "https://" },
  email: { rotulo: "E-mail", prefixo: "mailto:" },
};

/** Monta o endereço quando o autor digitou só o usuário. */
function enderecoDaRede(rede: keyof typeof REDES, valor: string): string {
  const v = valor.trim();
  if (!v) return "";
  if (/^(https?:|mailto:)/i.test(v)) return v;
  return REDES[rede].prefixo + v.replace(/^@/, "");
}

export function RedesSociais({ block, design }: { block: QuizBlock; design: QuizDesign }) {
  const links = (block.redes ?? []).filter((r) => r.url.trim());
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {links.map((r) => (
        <a
          key={r.id}
          href={enderecoDaRede(r.rede, r.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80"
          style={{
            borderRadius: 999,
            border: `1px solid ${withAlpha(design.text, 0.15)}`,
            color: design.text,
          }}
        >
          {REDES[r.rede].rotulo}
        </a>
      ))}
    </div>
  );
}
