/** Limites da resposta em vídeo. Valem no navegador E no servidor. */
export const VIDEO_RESPOSTA = {
  /** Duração máxima da gravação. */
  segundosMax: 60,
  /** 20MB, o mesmo teto do upload de mídia do construtor. */
  bytesMax: 20 * 1024 * 1024,
  /** O que o `MediaRecorder` produz nos navegadores atuais. */
  tiposAceitos: ["video/webm", "video/mp4"] as const,
};

export interface Recusa {
  motivo: string;
}

/**
 * Valida um envio de resposta em vídeo.
 *
 * Roda nos dois lados de propósito. No navegador serve para avisar a pessoa
 * antes de ela esperar um upload que vai falhar; no servidor é a que vale,
 * porque o endereço é PÚBLICO — sem validação do lado de lá, ele seria
 * hospedagem de arquivo grátis para qualquer um que achasse a URL.
 *
 * O `mimeType` chega com parâmetros (`video/webm;codecs=vp8,opus`), então a
 * comparação é por prefixo. Comparar a string inteira recusaria todo envio
 * real — e o erro apareceria só em produção, porque em teste a gente escreve
 * o tipo limpo.
 */
export function validarEnvioDeVideo(params: {
  bytes: number;
  mimeType: string;
  segundos?: number;
}): Recusa | null {
  const { bytes, mimeType, segundos } = params;

  if (!bytes || bytes <= 0) return { motivo: "Arquivo vazio." };
  if (bytes > VIDEO_RESPOSTA.bytesMax) {
    return { motivo: `Vídeo acima de ${Math.round(VIDEO_RESPOSTA.bytesMax / 1024 / 1024)}MB.` };
  }

  const base = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (!VIDEO_RESPOSTA.tiposAceitos.includes(base as never)) {
    return { motivo: "Formato não aceito. Grave pelo próprio quiz." };
  }

  if (segundos !== undefined && segundos > VIDEO_RESPOSTA.segundosMax + 2) {
    return { motivo: `Vídeo acima de ${VIDEO_RESPOSTA.segundosMax} segundos.` };
  }

  return null;
}

/** Caminho do arquivo no bucket. Sem nada que venha do visitante. */
export function caminhoDoVideo(companyId: string, quizId: string, id: string): string {
  return `${companyId}/${quizId}/respostas/${id}.webm`;
}
