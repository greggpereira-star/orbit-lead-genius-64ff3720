import { celulaCsv } from "@/lib/csvSeguro";
import type { LinhaDeCusto } from "../services/adIntelligenceService";
import { rotuloDoCanal, type FatiaDeCanal } from "./canais";
import type { Comparativo } from "./comparativo";
import type { LinhaDoFunil } from "./funil";

/**
 * Exportação em CSV dos números do Analytics.
 *
 * Exporta o que a tela mostra, com a mesma regra: valor que não existe (sem gasto, sem
 * régua de qualificação, sem venda) sai como CÉLULA VAZIA — nunca "0", que mentiria na
 * planilha — e nunca como "—", que quebraria uma soma. Ponto e vírgula como separador
 * e vírgula decimal, que é o que o Excel e o Sheets em português abrem direto.
 * Todo texto passa por `celulaCsv`, que neutraliza fórmula: nome de anúncio e de
 * campanha vêm de fora e poderiam começar por `=`.
 */
const SEPARADOR = ";";
const FIM_DE_LINHA = "\r\n";
const BOM = "﻿";

/** Número em pt-BR para a planilha (`1234,56`, sem separador de milhar). `null` vira vazio. */
export function numeroCsv(v: number | null | undefined, casas = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  return v.toLocaleString("pt-BR", {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: casas,
  });
}

export function montarCsv(colunas: string[], linhas: Array<Array<string | number | null>>): string {
  const celula = (v: string | number | null) => celulaCsv(v ?? "");
  return (
    BOM +
    [colunas, ...linhas].map((l) => l.map(celula).join(SEPARADOR)).join(FIM_DE_LINHA) +
    FIM_DE_LINHA
  );
}

export type SecaoExportavel = "resumo" | "funil" | "anuncios" | "canais";

export function nomeDoArquivo(secao: SecaoExportavel, dias: string, quando: Date): string {
  const dia = quando.toISOString().slice(0, 10);
  return `analytics-${secao}-${dias}d-${dia}.csv`;
}

export function csvDeAnuncios(linhas: LinhaDeCusto[]): string {
  return montarCsv(
    [
      "Anúncio",
      "Campanha",
      "Rede",
      "ID do anúncio",
      "Gasto",
      "Moeda",
      "Impressões",
      "Cliques",
      "Leads",
      "Custo por lead",
      "Qualificados",
      "Custo por qualificado",
      "Taxa de qualificação (%)",
      "Vendas",
      "Valor ganho",
      "ROAS",
      "Valor no pipeline",
    ],
    linhas.map((l) => [
      l.ad_name,
      l.campanha,
      l.rede,
      l.ad_id,
      numeroCsv(l.gasto),
      l.moeda ?? "",
      numeroCsv(l.impressoes, 0),
      numeroCsv(l.cliques, 0),
      numeroCsv(l.conversas, 0),
      numeroCsv(l.custo_por_lead),
      // Sem régua o qualificado não existe: vazio, não zero.
      l.taxa_qualificacao === null ? "" : numeroCsv(l.qualificados, 0),
      numeroCsv(l.custo_por_qualificado),
      numeroCsv(l.taxa_qualificacao, 1),
      numeroCsv(l.vendas, 0),
      numeroCsv(l.valor_ganho),
      numeroCsv(l.roas),
      numeroCsv(l.valor_total),
    ]),
  );
}

export function csvDeCanais(fatias: FatiaDeCanal[]): string {
  return montarCsv(
    ["Canal", "Código do canal", "Leads", "Percentual do total (%)"],
    fatias.map((f) => [
      rotuloDoCanal(f.canal),
      f.canal,
      numeroCsv(f.leads, 0),
      numeroCsv(f.percentual, 1),
    ]),
  );
}

const TIPO_DE_ETAPA: Record<string, string> = { open: "Aberta", won: "Ganha", lost: "Perdida" };

export function csvDoFunil(linhas: LinhaDoFunil[]): string {
  return montarCsv(
    [
      "Etapa",
      "Tipo",
      "Leads",
      "Percentual do total (%)",
      "Valor",
      "Parados há mais de 24 h",
      "Horas médias na etapa",
    ],
    linhas.map((l) => [
      l.nome,
      TIPO_DE_ETAPA[l.kind] ?? l.kind,
      numeroCsv(l.leads, 0),
      numeroCsv(l.percentual, 1),
      numeroCsv(l.valor),
      // "Parado" só existe em etapa aberta.
      l.kind === "open" ? numeroCsv(l.parados_24h, 0) : "",
      l.kind === "open" ? numeroCsv(l.horas_medias, 1) : "",
    ]),
  );
}

export interface DadosDoResumo {
  dias: string;
  leads: number | null;
  qualificados: number | null;
  /** Fração 0–1. */
  taxa: number | null;
  vendasValor: number | null;
  vendasQuantidade: number | null;
  /** Fração 0–1. */
  origemIdentificada: number | null;
  comparativo: Comparativo | undefined;
}

/**
 * Variação como NÚMERO (e não como texto "+5,3%"): o texto começa por `+`, e o neutralizador
 * de fórmula o prefixaria com apóstrofo na planilha. A unidade vai em coluna própria.
 */
const variacaoPercentualNum = (atual: number, anterior: number): number | null =>
  anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 1000) / 10;
const variacaoEmPontosNum = (atual: number | null, anterior: number | null): number | null =>
  atual === null || anterior === null ? null : Math.round((atual - anterior) * 1000) / 10;

/** Indicadores do topo da página, com o período anterior quando existe comparação válida. */
export function csvDoResumo(d: DadosDoResumo): string {
  const c = d.comparativo?.disponivel ? d.comparativo : null;
  const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : v * 100);
  const linha = (
    nome: string,
    atual: number | null,
    anterior: number | null | undefined,
    variacao: number | null,
    unidade: "%" | "p.p.",
    casas = 2,
  ): Array<string | number | null> => [
    nome,
    d.dias,
    numeroCsv(atual, casas),
    c ? numeroCsv(anterior ?? null, casas) : "",
    c ? numeroCsv(variacao, 1) : "",
    c && variacao !== null ? unidade : "",
  ];
  const contagem = (
    nome: string,
    atual: number | null,
    anterior: number | null | undefined,
    casas = 0,
  ) =>
    linha(
      nome,
      atual,
      anterior,
      c && atual !== null && anterior != null ? variacaoPercentualNum(atual, anterior) : null,
      "%",
      casas,
    );
  return montarCsv(
    ["Indicador", "Período (dias)", "Atual", "Período anterior", "Variação", "Unidade da variação"],
    [
      contagem("Leads", d.leads, c?.anterior.leads),
      contagem("Qualificados", d.qualificados, c?.anterior.qualificados),
      linha(
        "Taxa de qualificação (%)",
        pct(d.taxa),
        pct(c?.anterior.taxa),
        c ? variacaoEmPontosNum(d.taxa, c.anterior.taxa) : null,
        "p.p.",
        1,
      ),
      contagem("Vendas ganhas (quantidade)", d.vendasQuantidade, c?.anterior.vendas),
      contagem("Vendas ganhas (valor)", d.vendasValor, c?.anterior.valorGanho, 2),
      linha(
        "Origem identificada (%)",
        pct(d.origemIdentificada),
        pct(c?.anterior.origemIdentificada),
        c ? variacaoEmPontosNum(d.origemIdentificada, c.anterior.origemIdentificada) : null,
        "p.p.",
        1,
      ),
    ],
  );
}

/** Dispara o download no navegador. Fora do módulo puro para os testes não precisarem de DOM. */
export function baixarCsv(nome: string, conteudo: string): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
