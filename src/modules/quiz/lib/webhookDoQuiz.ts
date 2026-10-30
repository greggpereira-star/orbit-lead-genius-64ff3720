/**
 * Webhook de submissão do quiz, disparado pelo SERVIDOR.
 *
 * Antes o `fetch` saía do navegador do visitante, o que obrigava a URL do
 * cliente a ficar legível ao público (`settings` de quiz publicado) e
 * dependia de a aba continuar aberta. Agora a URL só é lida com a chave de
 * serviço e o corpo vem da submissão gravada, não do que a página disser.
 */

const SUBMISSAO_VALIDADE_MS = 15 * 60 * 1000;

/**
 * Só `https` e só host público. A URL é digitada por um usuário da empresa e
 * a requisição sai do nosso servidor: sem esta guarda, o webhook viraria uma
 * forma de alcançar `localhost`, a rede da VPS e os serviços internos.
 * Limite conhecido: valida o NOME do host, não o IP que ele resolve.
 */
export function urlDeWebhookSegura(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  let u: URL;
  try { u = new URL(valor.trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !host.includes(":")) return null; // "localhost", nomes internos
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) return null;
  if (host.includes(":")) return null; // IPv6 literal
  const ip = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ip) {
    const [a, b] = [Number(ip[1]), Number(ip[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return null;
    if (a === 169 && b === 254) return null;
    if (a === 172 && b >= 16 && b <= 31) return null;
    if (a === 192 && b === 168) return null;
    if (a === 100 && b >= 64 && b <= 127) return null;
  }
  return u.toString();
}

export interface SubmissaoGravada {
  id: string;
  quiz_id: string;
  score: number | null;
  temperature: string | null;
  tags: string[] | null;
  answers: Record<string, unknown> | null;
  tracking: Record<string, unknown> | null;
  status: string | null;
  completed_at: string | null;
}

/** A submissão ainda vale para disparo: do quiz certo, concluída e recente. */
export function submissaoElegivel(s: SubmissaoGravada | null, quizId: string, agora = Date.now()): boolean {
  if (!s || s.quiz_id !== quizId || s.status !== "completed") return false;
  const quando = s.completed_at ? Date.parse(s.completed_at) : NaN;
  return Number.isFinite(quando) && agora - quando >= 0 && agora - quando <= SUBMISSAO_VALIDADE_MS;
}

/** Mesmo formato que o navegador enviava, agora montado a partir do que está gravado. */
export function montarCorpoDoWebhook(s: SubmissaoGravada) {
  const { _contact, ...responses } = (s.answers ?? {}) as Record<string, unknown> & {
    _contact?: { email?: string | null; phone?: string | null; name?: string | null };
  };
  return {
    event: "quiz.submission.completed",
    quiz_id: s.quiz_id,
    submission_id: s.id,
    score: s.score,
    temperature: s.temperature,
    tags: s.tags ?? [],
    contact: {
      email: _contact?.email ?? null,
      phone: _contact?.phone ?? null,
      name: _contact?.name ?? null,
    },
    responses,
    tracking: s.tracking ?? {},
    completed_at: s.completed_at,
  };
}

export const CHAVE_WEBHOOK_ENVIADO = "_webhook_enviado_em";
