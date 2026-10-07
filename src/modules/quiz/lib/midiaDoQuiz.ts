/**
 * De quem é o arquivo quando um quiz é apagado.
 *
 * A mídia é gravada em `quiz-media/<empresa>/<quiz>/…`, então o arquivo
 * "pertence" ao quiz que o enviou. Mas **duplicar um quiz copia o schema com
 * as MESMAS URLs**: a cópia aponta para os arquivos do original e não tem os
 * seus. Apagar a mídia do original às cegas quebraria a cópia — imagem some,
 * vídeo some, e nada diz por quê.
 *
 * Daí a checagem: só apaga o que nenhum outro quiz referencia.
 */

export function prefixoDoQuiz(companyId: string, quizId: string): string {
  return `${companyId}/${quizId}/`;
}

/**
 * Este schema referencia algum arquivo que mora sob o prefixo?
 *
 * Procura no JSON inteiro, e não só nos campos de mídia conhecidos: a URL
 * aparece em `mediaUrl`, `imageUrl`, `marcaUrl`, dentro de itens de grade e de
 * carrossel, e em HTML personalizado. Enumerar os campos deixaria algum de
 * fora, e o preço do engano é apagar arquivo que outro quiz usa.
 */
export function schemaUsaPrefixo(schema: unknown, prefixo: string): boolean {
  if (!schema) return false;
  try {
    return JSON.stringify(schema).includes(prefixo);
  } catch {
    // Schema que não serializa: trata como "usa", porque o seguro aqui é não
    // apagar.
    return true;
  }
}

/** Algum dos outros quizzes depende da mídia deste? */
export function outroQuizUsaAMidia(schemasDeOutros: unknown[], prefixo: string): boolean {
  return schemasDeOutros.some((s) => schemaUsaPrefixo(s, prefixo));
}
