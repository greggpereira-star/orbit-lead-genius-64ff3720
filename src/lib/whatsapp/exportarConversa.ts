/**
 * Exportação de uma conversa em CSV. Funções puras.
 *
 * O arquivo sai do atendimento para planilha, e planilha EXECUTA fórmula: uma
 * célula que começa com `=`, `+`, `-` ou `@` (texto de cliente!) vira
 * comando. Por isso toda célula de texto livre é neutralizada.
 */
import { textoParaExibir, type MensagemDaConversa } from "../../modules/atendimento/lib/mensagens";

const COLUNAS = [
  "data_hora",
  "direcao",
  "origem",
  "autor",
  "tipo",
  "texto",
  "status",
  "template",
] as const;

const ROTULO_DIRECAO: Record<MensagemDaConversa["direction"], string> = {
  inbound: "cliente",
  outbound: "equipe",
};

const ROTULO_ORIGEM: Record<MensagemDaConversa["origin"], string> = {
  customer: "cliente",
  agent: "atendente",
  automation: "automação",
  app_echo: "aplicativo do celular",
  history: "histórico importado",
};

/** Neutraliza fórmula (=, +, -, @, tab, CR no início) e escapa para CSV. */
export function celulaCsv(valor: string): string {
  let v = valor.replace(/\r\n?/g, "\n");
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function conversaParaCsv(
  mensagens: MensagemDaConversa[],
  nomeDoAutor: (userId: string | null) => string = () => "",
): string {
  const ordenadas = [...mensagens].sort(
    (a, b) =>
      Date.parse(a.provider_ts ?? a.created_at) - Date.parse(b.provider_ts ?? b.created_at) ||
      a.id.localeCompare(b.id),
  );
  const linhas = ordenadas.map((m) =>
    [
      new Date(m.provider_ts ?? m.created_at).toISOString(),
      ROTULO_DIRECAO[m.direction],
      ROTULO_ORIGEM[m.origin] ?? m.origin,
      m.direction === "outbound" && m.origin === "agent" ? nomeDoAutor(m.sent_by) : "",
      m.type,
      textoParaExibir(m),
      m.status,
      m.template_name ?? "",
    ]
      .map(celulaCsv)
      .join(";"),
  );
  // BOM: o Excel em português abre UTF-8 com acento certo; `;` é o separador dele.
  return "﻿" + [COLUNAS.join(";"), ...linhas].join("\r\n") + "\r\n";
}

export function nomeDoArquivoDeExportacao(nome: string, agora: Date = new Date()): string {
  const base =
    nome
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "conversa";
  return `${base}_${agora.toISOString().slice(0, 10)}.csv`;
}
