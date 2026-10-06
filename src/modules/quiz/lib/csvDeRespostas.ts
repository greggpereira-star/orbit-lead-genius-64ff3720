import type { QuizBlock, QuizSchema } from "../types";

/** Blocos cuja resposta vale uma coluna no CSV. */
const COLETAM_RESPOSTA = new Set<QuizBlock["type"]>([
  "single-choice",
  "multi-choice",
  "rating",
  "short-text",
  "long-text",
  "email",
  "phone",
  "weight",
  "height",
  "form",
  "scheduling",
  "video-answer",
]);

export interface LinhaDeExport {
  created_at: string;
  status: string | null;
  score: number | null;
  temperature: string | null;
  answers: Record<string, unknown> | null;
  tracking: Record<string, unknown> | null;
}

const FIXAS = [
  "data",
  "nome",
  "email",
  "telefone",
  "score",
  "temperatura",
  "completo",
  "utm_source",
  "utm_campaign",
];

/** As perguntas que viram coluna, na ordem em que aparecem no funil. */
export function perguntasDoSchema(schema: QuizSchema | null): QuizBlock[] {
  return (schema?.blocks ?? []).filter((b) => COLETAM_RESPOSTA.has(b.type));
}

/**
 * Converte a resposta crua no que uma pessoa lê.
 *
 * O caso que motiva a função: a escolha única guarda o **id da opção**, e
 * `o3` não diz nada a ninguém. O CSV existe para analisar, e exportar ids
 * obriga quem recebe a cruzar com o schema na mão.
 */
export function valorLegivel(bloco: QuizBlock, bruto: unknown): string {
  if (bruto === undefined || bruto === null || bruto === "") return "";

  const rotuloDaOpcao = (v: unknown) => {
    const o = (bloco.options ?? []).find((x) => x.id === v || x.value === v);
    return o?.label ?? String(v);
  };

  if (Array.isArray(bruto)) return bruto.map(rotuloDaOpcao).join("; ");
  if (typeof bruto === "boolean") return bruto ? "sim" : "não";
  if (typeof bruto === "object") {
    // Agendamento vem como `{ data, hora }`; sem isto o CSV levaria
    // "[object Object]" em toda linha, que é pior que a célula vazia.
    const o = bruto as Record<string, unknown>;
    return [o.data, o.hora].filter(Boolean).join(" ").trim() || JSON.stringify(bruto);
  }
  return rotuloDaOpcao(bruto);
}

/** Cabeçalho da coluna. Nunca vazio: coluna sem nome é coluna inútil. */
export function tituloDaColuna(bloco: QuizBlock, indice: number): string {
  const t = (bloco.title ?? "").replace(/\s+/g, " ").trim();
  return t || `Pergunta ${indice + 1}`;
}

function escapar(v: unknown): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/**
 * CSV das respostas de um quiz.
 *
 * Antes levava só contato, pontuação e UTM — **nenhuma pergunta respondida**.
 * Quem exportava para analisar o funil recebia a lista de contatos e nada do
 * que as pessoas disseram.
 *
 * As colunas saem do SCHEMA, e não das chaves que aparecem nas respostas: duas
 * submissões podem ter respondido blocos diferentes, e montar coluna por linha
 * produziria um arquivo em que a mesma coluna muda de significado no meio.
 */
export function montarCsvDeRespostas(schema: QuizSchema | null, linhas: LinhaDeExport[]): string {
  const perguntas = perguntasDoSchema(schema);
  const cabecalho = [...FIXAS, ...perguntas.map(tituloDaColuna)];

  const corpo = linhas.map((l) => {
    const contato = (l.answers?._contact ?? {}) as {
      name?: string;
      email?: string;
      phone?: string;
    };
    const t = (l.tracking ?? {}) as Record<string, string>;
    return [
      l.created_at,
      contato.name ?? "",
      contato.email ?? "",
      contato.phone ?? "",
      l.score ?? "",
      l.temperature ?? "",
      l.status === "completed" ? "sim" : "não",
      t.utm_source ?? "",
      t.utm_campaign ?? "",
      ...perguntas.map((b) => valorLegivel(b, l.answers?.[b.id])),
    ];
  });

  return [cabecalho, ...corpo].map((linha) => linha.map(escapar).join(",")).join("\n");
}
