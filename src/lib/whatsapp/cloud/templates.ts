/**
 * Validação e montagem de templates de mensagem.
 *
 * Regras vindas de duas fontes, nomeadas em cada uma:
 *   [wacli]  README, "Gotchas": sem emoji no cabeçalho; URL de botão só http(s).
 *   [meta]   limites de tamanho e formato da documentação de templates. Foram
 *            escritos de memória da documentação e **precisam ser conferidos**
 *            contra a versão vigente da API — um limite errado aqui só produz
 *            aviso ao autor, mas nunca bloqueia o envio de algo válido.
 *
 * A validação serve para o autor errar na TELA, e não depois de esperar a
 * revisão da Meta — que recusa sem explicar bem.
 */

export type CategoriaDeTemplate = "MARKETING" | "UTILITY";

export interface BotaoDeTemplate {
  tipo: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  texto: string;
  /** URL (com `{{1}}` opcional no fim) ou telefone com +DDI. */
  valor?: string;
}

export interface DefinicaoDeTemplate {
  nome: string;
  idioma: string;
  categoria: CategoriaDeTemplate;
  cabecalho?: string;
  corpo: string;
  rodape?: string;
  botoes?: BotaoDeTemplate[];
  /** Exemplos das variáveis do corpo, na ordem {{1}}, {{2}}… */
  exemplosDoCorpo?: string[];
  exemplosDoCabecalho?: string[];
}

export interface Problema {
  campo: "nome" | "idioma" | "cabecalho" | "corpo" | "rodape" | "botoes" | "exemplos";
  gravidade: "erro" | "aviso";
  texto: string;
}

export const LIMITES = {
  corpo: 1024, // [meta]
  cabecalho: 60, // [meta]
  rodape: 60, // [meta]
  textoDoBotao: 25, // [meta]
  botoes: 10, // [meta]
  url: 2000, // [meta]
} as const;

const EMOJI = /\p{Extended_Pictographic}/u;
const VARIAVEL = /\{\{\s*(\d+)\s*\}\}/g;

/** Variáveis `{{n}}` de um texto, na ordem em que aparecem. */
export function variaveisDe(texto: string): number[] {
  return [...texto.matchAll(VARIAVEL)].map((m) => Number(m[1]));
}

/** `{{1}} {{2}}` esperados: sequência 1..n sem buracos nem repetição. */
function sequenciaValida(vars: number[]): boolean {
  const unicas = [...new Set(vars)].sort((a, b) => a - b);
  return unicas.every((v, i) => v === i + 1);
}

export function validarTemplate(d: DefinicaoDeTemplate): Problema[] {
  const p: Problema[] = [];
  const erro = (campo: Problema["campo"], texto: string) =>
    p.push({ campo, gravidade: "erro", texto });
  const aviso = (campo: Problema["campo"], texto: string) =>
    p.push({ campo, gravidade: "aviso", texto });

  if (!/^[a-z0-9_]{1,512}$/.test(d.nome)) {
    erro("nome", "Use só letras minúsculas, números e sublinhado (ex.: boas_vindas_v1).");
  }
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(d.idioma)) {
    erro("idioma", "Código de idioma inválido (ex.: pt_BR).");
  }

  // Corpo
  const corpo = d.corpo.trim();
  if (!corpo) erro("corpo", "O corpo é obrigatório.");
  if (corpo.length > LIMITES.corpo) erro("corpo", `O corpo passa de ${LIMITES.corpo} caracteres.`);
  const varsCorpo = variaveisDe(corpo);
  if (!sequenciaValida(varsCorpo)) {
    erro("corpo", "As variáveis devem ser {{1}}, {{2}}… em sequência, sem pular número.");
  }
  if (/^\s*\{\{\s*\d+\s*\}\}/.test(corpo) || /\{\{\s*\d+\s*\}\}\s*$/.test(corpo)) {
    aviso("corpo", "A Meta costuma recusar corpo que começa ou termina com variável. [meta]");
  }
  const qtdCorpo = new Set(varsCorpo).size;
  const exemplos = d.exemplosDoCorpo ?? [];
  if (qtdCorpo > 0 && exemplos.filter((e) => e.trim() !== "").length < qtdCorpo) {
    erro("exemplos", `Informe um exemplo para cada variável do corpo (${qtdCorpo}). A Meta exige.`);
  }

  // Cabeçalho (só texto nesta fase)
  if (d.cabecalho !== undefined && d.cabecalho.trim() !== "") {
    const c = d.cabecalho.trim();
    if (c.length > LIMITES.cabecalho)
      erro("cabecalho", `O cabeçalho passa de ${LIMITES.cabecalho} caracteres.`);
    if (EMOJI.test(c))
      erro("cabecalho", "Emoji no cabeçalho é recusado pela Meta. Use no corpo. [wacli]");
    if (/[\n*_~]/.test(c))
      erro("cabecalho", "Cabeçalho não aceita quebra de linha nem formatação. [meta]");
    if (new Set(variaveisDe(c)).size > 1)
      erro("cabecalho", "O cabeçalho aceita no máximo 1 variável. [meta]");
  }

  // Rodapé
  if (d.rodape !== undefined && d.rodape.trim() !== "") {
    const r = d.rodape.trim();
    if (r.length > LIMITES.rodape)
      erro("rodape", `O rodapé passa de ${LIMITES.rodape} caracteres.`);
    if (variaveisDe(r).length > 0) erro("rodape", "O rodapé não aceita variáveis. [meta]");
  }

  // Botões
  const botoes = d.botoes ?? [];
  if (botoes.length > LIMITES.botoes) erro("botoes", `No máximo ${LIMITES.botoes} botões.`);
  botoes.forEach((b, i) => {
    const n = i + 1;
    if (!b.texto.trim()) erro("botoes", `Botão ${n}: escreva o texto.`);
    if (b.texto.length > LIMITES.textoDoBotao) {
      erro("botoes", `Botão ${n}: o texto passa de ${LIMITES.textoDoBotao} caracteres.`);
    }
    if (b.tipo === "URL") {
      const v = (b.valor ?? "").trim();
      if (!/^https:\/\//i.test(v)) {
        // [wacli] "URL buttons must be http(s)"; só https evita rejeição por segurança.
        erro("botoes", `Botão ${n}: a URL deve começar com https://.`);
      } else if (v.length > LIMITES.url) {
        erro("botoes", `Botão ${n}: URL longa demais.`);
      }
      if (new Set(variaveisDe(v)).size > 1)
        erro("botoes", `Botão ${n}: a URL aceita uma única variável, no fim.`);
    }
    if (b.tipo === "PHONE_NUMBER" && !/^\+\d{8,15}$/.test((b.valor ?? "").trim())) {
      erro("botoes", `Botão ${n}: telefone no formato +5527999990000.`);
    }
  });

  return p;
}

export const temErro = (p: Problema[]) => p.some((x) => x.gravidade === "erro");

/** Define → componentes no formato da Graph API. */
export function montarComponentes(d: DefinicaoDeTemplate): unknown[] {
  const componentes: unknown[] = [];

  const cab = d.cabecalho?.trim();
  if (cab) {
    const temVar = variaveisDe(cab).length > 0;
    componentes.push({
      type: "HEADER",
      format: "TEXT",
      text: cab,
      ...(temVar ? { example: { header_text: (d.exemplosDoCabecalho ?? []).slice(0, 1) } } : {}),
    });
  }

  const nVars = new Set(variaveisDe(d.corpo)).size;
  componentes.push({
    type: "BODY",
    text: d.corpo.trim(),
    ...(nVars > 0 ? { example: { body_text: [(d.exemplosDoCorpo ?? []).slice(0, nVars)] } } : {}),
  });

  const rod = d.rodape?.trim();
  if (rod) componentes.push({ type: "FOOTER", text: rod });

  const botoes = d.botoes ?? [];
  if (botoes.length > 0) {
    componentes.push({
      type: "BUTTONS",
      buttons: botoes.map((b) => {
        if (b.tipo === "QUICK_REPLY") return { type: "QUICK_REPLY", text: b.texto.trim() };
        if (b.tipo === "PHONE_NUMBER") {
          return {
            type: "PHONE_NUMBER",
            text: b.texto.trim(),
            phone_number: (b.valor ?? "").trim(),
          };
        }
        const url = (b.valor ?? "").trim();
        return {
          type: "URL",
          text: b.texto.trim(),
          url,
          ...(variaveisDe(url).length > 0 ? { example: [url.replace(VARIAVEL, "exemplo")] } : {}),
        };
      }),
    });
  }
  return componentes;
}

/**
 * Parâmetros do corpo para um envio: valores na ordem de `{{1}}…`.
 * Falta de valor é erro — a Meta devolve 132000 (contagem divergente).
 */
export function parametrosDoCorpo(
  corpo: string,
  valores: Record<number, string>,
): { ok: true; parametros: unknown[] } | { ok: false; faltando: number[] } {
  const n = new Set(variaveisDe(corpo)).size;
  const faltando: number[] = [];
  const parametros: unknown[] = [];
  for (let i = 1; i <= n; i++) {
    const v = valores[i];
    if (v === undefined || v.trim() === "") faltando.push(i);
    else parametros.push({ type: "text", text: v });
  }
  return faltando.length ? { ok: false, faltando } : { ok: true, parametros };
}
