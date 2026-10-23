/**
 * Campos personalizados do lead: regras puras (chave, opções, exibição). O banco valida o valor por
 * tipo em `definir_campo_do_lead`; aqui ficam as regras que a tela precisa para montar e ler.
 */
export type TipoDeCampo = "text" | "number" | "date" | "select";

export const TIPOS: ReadonlyArray<{ valor: TipoDeCampo; rotulo: string }> = [
  { valor: "text", rotulo: "Texto" },
  { valor: "number", rotulo: "Número" },
  { valor: "date", rotulo: "Data" },
  { valor: "select", rotulo: "Lista de opções" },
];

export interface DefinicaoDeCampo {
  id: string;
  key: string;
  label: string;
  type: TipoDeCampo;
  options: string[];
  position: number;
  active: boolean;
}

/**
 * "Orçamento (R$)" → "orcamento_r". A chave é o que as automações usam (`cf_orcamento_r`) e NÃO
 * muda ao renomear o rótulo, então precisa ser estável e segura: minúsculas, sem acento, só
 * letras, números e `_`, começando por letra, até 40 caracteres.
 */
export function chaveDoRotulo(rotulo: string): string {
  const base = rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const comLetra = /^[a-z]/.test(base) ? base : base ? `c_${base}` : "campo";
  return comLetra.slice(0, 40).replace(/_+$/g, "") || "campo";
}

/** Garante chave única na empresa: "curso", "curso_2", "curso_3"… */
export function chaveUnica(rotulo: string, existentes: Iterable<string>): string {
  const usadas = new Set(existentes);
  const base = chaveDoRotulo(rotulo);
  if (!usadas.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const sufixo = `_${n}`;
    const tentativa = `${base.slice(0, 40 - sufixo.length)}${sufixo}`;
    if (!usadas.has(tentativa)) return tentativa;
  }
  return `${base.slice(0, 30)}_${Date.now() % 100000}`;
}

/** Opções digitadas uma por linha: sem vazias, sem repetidas (mesmo com outra caixa), até 50. */
export function opcoesDeTexto(texto: string): string[] {
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const linha of texto.split(/\r?\n/)) {
    const o = linha.trim();
    if (!o || o.length > 80) continue;
    const k = o.toLowerCase();
    if (vistas.has(k)) continue;
    vistas.add(k);
    saida.push(o);
    if (saida.length >= 50) break;
  }
  return saida;
}

/** Erro do formulário de definição (null = ok). */
export function erroDaDefinicao(d: {
  label: string;
  type: TipoDeCampo;
  options: string[];
}): string | null {
  if (!d.label.trim()) return "Dê um nome ao campo.";
  if (d.label.trim().length > 60) return "O nome do campo tem no máximo 60 caracteres.";
  if (d.type === "select" && d.options.length < 2)
    return "Uma lista precisa de ao menos duas opções.";
  return null;
}

const DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Valor guardado → texto para exibir ("5.5" → "5,5"; "2026-11-10" → "10/11/2026"). */
export function valorParaExibir(tipo: TipoDeCampo, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (tipo === "number") {
    const n = Number(valor);
    return Number.isFinite(n)
      ? n.toLocaleString("pt-BR", { maximumFractionDigits: 6 })
      : String(valor);
  }
  if (tipo === "date") {
    const m = DATA.exec(String(valor));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valor);
  }
  return String(valor);
}

/** Valor guardado → o que o campo de edição mostra (número com vírgula, data em ISO para <input type=date>). */
export function valorParaEdicao(tipo: TipoDeCampo, valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (tipo === "number") return String(valor).replace(".", ",");
  return String(valor);
}

/** Nome da variável usada nas automações: `{{cf_curso}}` e condição `cf_curso`. */
export const variavelDaAutomacao = (key: string): string => `cf_${key}`;
