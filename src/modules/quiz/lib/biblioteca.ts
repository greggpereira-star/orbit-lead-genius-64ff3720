export type TipoDeArquivo = "imagem" | "video" | "audio" | "outro";

export interface ArquivoDaBiblioteca {
  /** Caminho completo no bucket: `<empresa>/<quiz>/…`. */
  caminho: string;
  bytes: number;
  mimeType: string;
  criadoEm: string;
  /** Quiz de onde o arquivo veio, lido do caminho. */
  quizId: string | null;
  /** Resposta em vídeo gravada por um visitante. */
  deVisitante: boolean;
}

export interface ArquivoClassificado extends ArquivoDaBiblioteca {
  tipo: TipoDeArquivo;
  /** O quiz de origem ainda existe? */
  orfao: boolean;
  /** Algum quiz referencia este arquivo no schema? */
  emUso: boolean;
  nome: string;
  /** Nome do quiz de origem, quando ele ainda existe. */
  quizNome: string | null;
}

/**
 * O quiz dono do arquivo, lido do caminho `<empresa>/<quiz>/…`.
 *
 * Devolve `null` quando o caminho não tem essa forma — arquivo antigo, ou
 * gravado por outro caminho. Tratar como "sem dono conhecido" é melhor que
 * adivinhar: quem decide apagar é o usuário, e ele precisa ver a verdade.
 */
export function quizDoCaminho(caminho: string, companyId: string): string | null {
  const resto = caminho.startsWith(`${companyId}/`) ? caminho.slice(companyId.length + 1) : null;
  if (!resto) return null;
  const parte = resto.split("/")[0];
  return parte && parte !== resto ? parte : null;
}

export function tipoDoArquivo(mimeType: string, caminho: string): TipoDeArquivo {
  const m = (mimeType || "").toLowerCase();
  if (m.startsWith("image/")) return "imagem";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  // Sem mime confiável, decide pela extensão — o storage nem sempre guarda o
  // tipo, e um cartão sem prévia é um cartão inútil.
  const ext = caminho.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"].includes(ext)) return "imagem";
  if (["mp4", "webm", "mov", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "audio";
  return "outro";
}

/** `1,4 MB`, `820 KB`. Em português, com vírgula decimal. */
export function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

/**
 * Cruza os arquivos com os quizzes existentes e com o que eles referenciam.
 *
 * Duas perguntas diferentes, e é importante não confundi-las:
 *
 * - **órfão**: o quiz que gerou o arquivo não existe mais. Candidato a apagar.
 * - **em uso**: ALGUM quiz referencia o arquivo no schema. Um arquivo pode ser
 *   órfão e estar em uso ao mesmo tempo — é o caso de uma cópia que aponta
 *   para a mídia do original já apagado. Apagar esse quebraria a cópia.
 */
export function classificarArquivos(params: {
  arquivos: ArquivoDaBiblioteca[];
  companyId: string;
  quizzesExistentes: string[];
  /** Schemas dos quizzes existentes, já serializados. */
  schemasSerializados: string[];
  /** `id -> nome` dos quizzes existentes, para o cartão dizer de onde veio. */
  nomesDeQuiz?: Record<string, string>;
}): ArquivoClassificado[] {
  const { arquivos, quizzesExistentes, schemasSerializados, nomesDeQuiz } = params;
  const existentes = new Set(quizzesExistentes);
  const todoOTexto = schemasSerializados.join("\n");

  return arquivos.map((a) => ({
    ...a,
    nome: a.caminho.split("/").pop() ?? a.caminho,
    tipo: tipoDoArquivo(a.mimeType, a.caminho),
    orfao: !a.quizId || !existentes.has(a.quizId),
    emUso: todoOTexto.includes(a.caminho),
    /* Sem nome quando o quiz já foi apagado: o cartão diz "órfão" e isso é a
       informação honesta. Inventar um nome aqui seria pior que não ter. */
    quizNome: (a.quizId && nomesDeQuiz?.[a.quizId]) || null,
  }));
}

/** Órfãos que ninguém referencia — o que é seguro apagar em lote. */
export function seguroApagar(arquivos: ArquivoClassificado[]): ArquivoClassificado[] {
  return arquivos.filter((a) => a.orfao && !a.emUso);
}
