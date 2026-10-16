/**
 * Pré-visualização de template: o que o cliente verá. Funções puras.
 *
 * A formatação do WhatsApp é: *negrito*, _itálico_, ~tachado~ e ```monoespaçado```.
 * O marcador só vale colado ao texto (sem espaço logo depois de abrir nem logo
 * antes de fechar) e não atravessa quebra de linha — igual ao aplicativo.
 */
import type { DefinicaoDeTemplate } from "./templates";

export type Estilo = "negrito" | "italico" | "tachado" | "mono";
export interface Trecho {
  texto: string;
  estilos: Estilo[];
}

const MARCADORES: Array<{ marca: string; estilo: Estilo }> = [
  { marca: "```", estilo: "mono" },
  { marca: "*", estilo: "negrito" },
  { marca: "_", estilo: "italico" },
  { marca: "~", estilo: "tachado" },
];

/** Quebra o texto em trechos com os estilos que o WhatsApp aplicaria. */
export function formatarWhatsApp(texto: string, herdados: Estilo[] = []): Trecho[] {
  const saida: Trecho[] = [];
  let i = 0;
  let pendente = "";
  const descarregar = () => {
    if (pendente) saida.push({ texto: pendente, estilos: herdados });
    pendente = "";
  };

  while (i < texto.length) {
    let casou = false;
    for (const { marca, estilo } of MARCADORES) {
      if (!texto.startsWith(marca, i)) continue;
      const inicio = i + marca.length;
      // Abre só se o próximo caractere não é espaço/quebra.
      if (inicio >= texto.length || /\s/.test(texto[inicio])) continue;
      const fim = texto.indexOf(marca, inicio);
      if (fim === -1) continue;
      const miolo = texto.slice(inicio, fim);
      // Não atravessa linha e fecha colado ao texto.
      if (miolo.length === 0 || miolo.includes("\n") || /\s$/.test(miolo)) continue;
      descarregar();
      // Dentro do monoespaçado nada mais é formatado.
      if (estilo === "mono") saida.push({ texto: miolo, estilos: [...herdados, "mono"] });
      else saida.push(...formatarWhatsApp(miolo, [...herdados, estilo]));
      i = fim + marca.length;
      casou = true;
      break;
    }
    if (!casou) {
      pendente += texto[i];
      i += 1;
    }
  }
  descarregar();
  return saida;
}

/** Troca `{{n}}` pelo exemplo digitado; sem exemplo, mantém o `{{n}}` à vista. */
export function substituirVariaveis(texto: string, exemplos: string[] = []): string {
  return texto.replace(/\{\{\s*(\d+)\s*\}\}/g, (todo, n: string) => {
    const e = exemplos[Number(n) - 1]?.trim();
    return e ? e : todo.replace(/\s+/g, "");
  });
}

export interface Previa {
  cabecalho: string | null;
  corpo: string;
  rodape: string | null;
  botoes: Array<{ tipo: string; texto: string }>;
}

export function previaDoTemplate(d: DefinicaoDeTemplate): Previa {
  const cab = d.cabecalho?.trim();
  const rod = d.rodape?.trim();
  return {
    cabecalho: cab ? substituirVariaveis(cab, d.exemplosDoCabecalho) : null,
    corpo: substituirVariaveis(d.corpo, d.exemplosDoCorpo),
    rodape: rod || null,
    botoes: (d.botoes ?? [])
      .filter((b) => b.texto.trim() !== "")
      .map((b) => ({ tipo: b.tipo, texto: b.texto.trim() })),
  };
}

/** Quantas variáveis distintas o texto tem (a próxima é `n + 1`). */
export function proximaVariavel(texto: string): number {
  const nums = [...texto.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

/**
 * Aplica a barra de ferramentas ao campo: envolve a seleção com o marcador
 * (ou insere o par vazio) e devolve o novo texto e onde fica o cursor.
 */
export function envolverSelecao(
  texto: string,
  ini: number,
  fim: number,
  marca: string,
): { texto: string; cursor: [number, number] } {
  const a = Math.max(0, Math.min(ini, texto.length));
  const b = Math.max(a, Math.min(fim, texto.length));
  const sel = texto.slice(a, b);
  const novo = texto.slice(0, a) + marca + sel + marca + texto.slice(b);
  return { texto: novo, cursor: [a + marca.length, a + marca.length + sel.length] };
}

/** Insere `{{n}}` na posição do cursor (substituindo a seleção). */
export function inserirVariavel(
  texto: string,
  ini: number,
  fim: number,
): { texto: string; cursor: number } {
  const n = proximaVariavel(texto);
  const marca = `{{${n}}}`;
  const a = Math.max(0, Math.min(ini, texto.length));
  const b = Math.max(a, Math.min(fim, texto.length));
  return { texto: texto.slice(0, a) + marca + texto.slice(b), cursor: a + marca.length };
}
