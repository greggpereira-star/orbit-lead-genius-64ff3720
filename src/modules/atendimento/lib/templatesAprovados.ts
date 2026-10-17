import { previaDoTemplate, type Previa } from "@/lib/whatsapp/cloud/previa";
import { variaveisDe } from "@/lib/whatsapp/cloud/templates";
import type { TemplateAprovado } from "../hooks/useAtendimento";

/** Rótulo da categoria na linguagem de quem atende (a Meta fala MARKETING/UTILITY). */
export const ROTULO_DA_CATEGORIA: Record<string, string> = {
  UTILITY: "Utilidade",
  MARKETING: "Marketing",
  AUTHENTICATION: "Autenticação",
};

export const rotuloDaCategoria = (c: string): string =>
  ROTULO_DA_CATEGORIA[c.toUpperCase()] ?? c.toLowerCase();

const componente = (t: Pick<TemplateAprovado, "components">, tipo: string) =>
  t.components.find((c) => String(c.type).toUpperCase() === tipo);

export function corpoDe(t: Pick<TemplateAprovado, "components">): string {
  return String(componente(t, "BODY")?.text ?? "");
}

/** Quantas variáveis DISTINTAS o corpo tem ({{1}}, {{2}}…). */
export function totalDeVariaveis(t: Pick<TemplateAprovado, "components">): number {
  return new Set(variaveisDe(corpoDe(t))).size;
}

/**
 * Exemplos que o autor deu à Meta para cada variável (na ordem {{1}}, {{2}}…).
 * Servem de dica no campo: "ex.: sábado às 10h" diz o que cabe ali melhor que "Valor de {{2}}".
 */
export function exemplosDoCorpo(t: Pick<TemplateAprovado, "components">): string[] {
  const ex = componente(t, "BODY")?.example as { body_text?: unknown } | undefined;
  const linha = Array.isArray(ex?.body_text) ? (ex?.body_text as unknown[])[0] : undefined;
  return Array.isArray(linha) ? linha.map((x) => String(x)) : [];
}

/** Primeira ideia do template, para a lista (uma linha, sem as chaves das variáveis). */
export function resumoDoCorpo(t: Pick<TemplateAprovado, "components">, max = 96): string {
  const s = corpoDe(t)
    .replace(/\{\{\s*\d+\s*\}\}/g, "…")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** O template como o cliente o verá, com os valores já digitados (vazio mantém o `{{n}}` à vista). */
export function previaDeAprovado(
  t: Pick<TemplateAprovado, "name" | "language" | "category" | "components">,
  valores: Record<number, string>,
): Previa {
  const n = totalDeVariaveis(t);
  const lista = Array.from({ length: n }, (_, i) => valores[i + 1] ?? "");
  const cab = componente(t, "HEADER");
  const rod = componente(t, "FOOTER");
  const botoes = componente(t, "BUTTONS")?.buttons;
  return previaDoTemplate({
    nome: t.name,
    idioma: t.language,
    categoria: t.category.toUpperCase() === "MARKETING" ? "MARKETING" : "UTILITY",
    // Cabeçalho de mídia (imagem, vídeo) ainda não é enviado pelo sistema: só o de texto aparece.
    cabecalho:
      String(cab?.format ?? "TEXT").toUpperCase() === "TEXT" ? String(cab?.text ?? "") : "",
    corpo: corpoDe(t),
    rodape: String(rod?.text ?? ""),
    botoes: Array.isArray(botoes)
      ? (botoes as Array<Record<string, unknown>>).map((b) => ({
          tipo: String(b.type ?? "QUICK_REPLY") as never,
          texto: String(b.text ?? ""),
        }))
      : [],
    exemplosDoCorpo: lista,
  });
}

/** Números das variáveis ainda sem valor (ex.: [2]). */
export function variaveisSemValor(n: number, valores: Record<number, string>): number[] {
  return Array.from({ length: n }, (_, i) => i + 1).filter((i) => !(valores[i] ?? "").trim());
}
