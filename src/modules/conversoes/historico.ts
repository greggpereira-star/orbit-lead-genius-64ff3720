/**
 * Histórico de envios de conversão (etapa do funil → Meta / Google / etiqueta).
 *
 * Funções puras: leem a linha de `conversion_dispatches` como o despachante a grava e
 * a transformam em algo que uma pessoa entende e em que pode agir.
 */

export type EstadoDoEnvio = "pending" | "sent" | "rehearsal" | "failed" | "skipped";

export interface EnvioDeConversao {
  id: string;
  lead_id: string;
  stage_id: string;
  event_id: string;
  status: EstadoDoEnvio | string;
  meta_result: unknown;
  google_result: unknown;
  label_result: unknown;
  attempts: number;
  reenvios: number;
  last_error: string | null;
  occurred_at: string;
  dispatched_at: string | null;
  created_at: string;
}

export const ROTULO_DO_ESTADO: Record<string, string> = {
  pending: "Na fila",
  sent: "Enviado",
  rehearsal: "Ensaio",
  failed: "Falhou",
  skipped: "Ignorado",
};

export type ResultadoDoDestino = "enviado" | "ensaio" | "falhou" | "pulado" | "nao_configurado";

export interface DestinoDoEnvio {
  destino: "Meta" | "Google" | "Etiqueta";
  resultado: ResultadoDoDestino;
  detalhe: string | null;
}

const objeto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Mensagem do corpo de erro devolvido pela Meta (`{ error: { message, error_subcode } }`). */
function mensagemDaMeta(resposta: unknown): string | null {
  const erro = objeto(objeto(resposta)?.error);
  return texto(erro?.error_user_msg) ?? texto(erro?.message);
}

function subcodigoDaMeta(resposta: unknown): number | null {
  const s = objeto(objeto(resposta)?.error)?.error_subcode;
  return typeof s === "number" ? s : null;
}

export function destinosDoEnvio(e: Pick<EnvioDeConversao, "status" | "meta_result" | "google_result" | "label_result">): DestinoDoEnvio[] {
  const saida: DestinoDoEnvio[] = [];

  const meta = objeto(e.meta_result);
  if (e.status === "skipped") {
    return [{ destino: "Meta", resultado: "pulado", detalhe: texto(meta?.motivo) }];
  }
  if (meta) {
    const s = texto(meta.status);
    const resultado: ResultadoDoDestino = s === "sent" ? "enviado" : s === "rehearsal" ? "ensaio" : "falhou";
    saida.push({
      destino: "Meta",
      resultado,
      detalhe: resultado === "falhou" ? (mensagemDaMeta(meta.resposta) ?? texto(meta.erro)) : null,
    });
  } else {
    saida.push({ destino: "Meta", resultado: "nao_configurado", detalhe: null });
  }

  const google = objeto(e.google_result);
  if (google) {
    const s = texto(google.status);
    const resultado: ResultadoDoDestino =
      s === "enviada" ? "enviado" : s === "ensaio" ? "ensaio" : "falhou";
    saida.push({ destino: "Google", resultado, detalhe: resultado === "falhou" ? texto(google.detalhe) : null });
  } else {
    saida.push({ destino: "Google", resultado: "nao_configurado", detalhe: null });
  }

  const etiqueta = objeto(e.label_result);
  if (etiqueta) {
    const s = texto(etiqueta.status);
    saida.push({
      destino: "Etiqueta",
      resultado: s === "aplicada" ? "enviado" : s === "pulado" ? "pulado" : "falhou",
      detalhe: s === "aplicada" ? null : (texto(etiqueta.motivo) ?? texto(etiqueta.erro)),
    });
  }
  return saida;
}

export interface ExplicacaoDeFalha {
  resumo: string;
  sugestao: string;
  /** `false` quando reenviar sem corrigir nada repete o mesmo erro. */
  adiantaReenviar: boolean;
}

/**
 * Traduz o erro bruto do destino. O texto original continua disponível na tela:
 * isto só diz o que provavelmente é e o que fazer.
 */
export function explicarFalha(
  destino: "Meta" | "Google" | "Etiqueta",
  detalhe: string | null,
  metaResult?: unknown,
): ExplicacaoDeFalha {
  const d = (detalhe ?? "").toLowerCase();

  if (destino === "Meta") {
    const meta = objeto(metaResult);
    const subcodigo = subcodigoDaMeta(meta?.resposta);
    const http = typeof meta?.http === "number" ? meta.http : null;
    if (subcodigo === 2804116) {
      return {
        resumo: "A Meta exige a página do Facebook ou a conta do WhatsApp Business ligada ao lead.",
        sugestao: "Conecte a conta do WhatsApp Business (ou a página) em Configurações e reenvie.",
        adiantaReenviar: false,
      };
    }
    if (http === 401 || /access token|oauthexception|session has expired|invalid oauth/.test(d)) {
      return {
        resumo: "A Meta recusou o acesso: o token expirou ou foi revogado.",
        sugestao: "Reconecte a integração com a Meta e reenvie.",
        adiantaReenviar: false,
      };
    }
    if (http !== null && http >= 500) {
      return {
        resumo: "A Meta ficou instável na hora do envio.",
        sugestao: "Reenvie. Costuma passar na segunda tentativa.",
        adiantaReenviar: true,
      };
    }
    if (http === 400) {
      return {
        resumo: "A Meta recusou o evento por um problema nos dados enviados.",
        sugestao: "Veja a mensagem original abaixo. Se citar horário antigo, a Meta só aceita eventos de até 7 dias.",
        adiantaReenviar: false,
      };
    }
    if (/fetch failed|network|timeout|econn|enotfound/.test(d)) {
      return { resumo: "Falha de rede ao falar com a Meta.", sugestao: "Reenvie.", adiantaReenviar: true };
    }
    return { resumo: "Não foi possível enviar à Meta.", sugestao: "Veja a mensagem original abaixo.", adiantaReenviar: true };
  }

  if (destino === "Google") {
    if (d.includes("identificador de clique")) {
      return {
        resumo: "O lead não tem gclid, wbraid nem gbraid, e sem contato o Google não liga a venda a um clique.",
        sugestao: "Reenviar não resolve. Para os próximos, use o link de redirecionamento nos anúncios do Google.",
        adiantaReenviar: false,
      };
    }
    if (d.includes("nenhuma conta do google ads")) {
      return {
        resumo: "Nenhuma conta do Google Ads foi escolhida para esta empresa.",
        sugestao: "Escolha a conta em Integrações e reenvie.",
        adiantaReenviar: false,
      };
    }
    if (d.includes("nenhuma ação de conversão")) {
      return {
        resumo: "A etapa não tem ação de conversão do Google configurada.",
        sugestao: "Configure a ação na regra da etapa e reenvie.",
        adiantaReenviar: false,
      };
    }
    if (d.includes("developer token")) {
      return {
        resumo: "O servidor não tem o developer token do Google Ads.",
        sugestao: "É configuração da plataforma. Avise o suporte.",
        adiantaReenviar: false,
      };
    }
    if (/fetch failed|network|timeout|econn|enotfound/.test(d)) {
      return { resumo: "Falha de rede ao falar com o Google.", sugestao: "Reenvie.", adiantaReenviar: true };
    }
    return { resumo: "Não foi possível enviar ao Google.", sugestao: "Veja a mensagem original abaixo.", adiantaReenviar: true };
  }

  return {
    resumo: "A etiqueta não foi aplicada no WhatsApp.",
    sugestao: "Não afeta a conversão enviada à mídia. Confira se o WhatsApp está conectado.",
    adiantaReenviar: false,
  };
}

const DIA_MS = 86_400_000;
export const JANELA_DA_META_EM_DIAS = 7;

export function idadeEmDias(iso: string, agora: Date): number {
  return Math.floor((agora.getTime() - new Date(iso).getTime()) / DIA_MS);
}

/** Só falhas e ensaios voltam para a fila. */
export function podeReenviar(e: Pick<EnvioDeConversao, "status">): boolean {
  return e.status === "failed" || e.status === "rehearsal";
}

/** A Meta recusa evento com mais de 7 dias; o Google aceita bem mais. */
export function avisoDeReenvio(e: Pick<EnvioDeConversao, "occurred_at" | "meta_result">, agora: Date): string | null {
  if (!objeto(e.meta_result)) return null;
  const dias = idadeEmDias(e.occurred_at, agora);
  if (dias > JANELA_DA_META_EM_DIAS) {
    return `Este evento tem ${dias} dias. A Meta só aceita eventos de até ${JANELA_DA_META_EM_DIAS} dias e vai recusar o envio dela; o Google ainda aceita.`;
  }
  return null;
}

export interface ResumoDosEnvios {
  total: number;
  enviados: number;
  falhas: number;
  ensaios: number;
  naFila: number;
  ignorados: number;
}

export function resumirEnvios(linhas: ReadonlyArray<Pick<EnvioDeConversao, "status">>): ResumoDosEnvios {
  const r: ResumoDosEnvios = { total: linhas.length, enviados: 0, falhas: 0, ensaios: 0, naFila: 0, ignorados: 0 };
  for (const l of linhas) {
    if (l.status === "sent") r.enviados++;
    else if (l.status === "failed") r.falhas++;
    else if (l.status === "rehearsal") r.ensaios++;
    else if (l.status === "pending") r.naFila++;
    else if (l.status === "skipped") r.ignorados++;
  }
  return r;
}
