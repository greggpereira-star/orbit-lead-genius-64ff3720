/**
 * Envio de e-mail pela API da Resend. A chave vem do ambiente do servidor (`RESEND_API_KEY`);
 * sem ela o envio simplesmente não está configurado e quem chama cai no caminho "copiar link".
 *
 * Nunca registra em log a chave, o destinatário completo nem o corpo da mensagem (o corpo do
 * convite contém o código secreto).
 */
export type ResultadoDoEnvio =
  | { ok: true; id: string | null }
  | { ok: false; motivo: "nao_configurado" | "recusado" | "rede"; status?: number };

export const REMETENTE_PADRAO = "ALT Leadflow <naoresponda@altleadflow.com.br>";

export function envioDeEmailConfigurado(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY && env.RESEND_API_KEY.trim().length > 10);
}

export async function enviarEmail(
  a: { para: string; assunto: string; html: string; texto: string },
  opcoes: { env?: Record<string, string | undefined>; fetchFn?: typeof fetch } = {},
): Promise<ResultadoDoEnvio> {
  const env = opcoes.env ?? process.env;
  if (!envioDeEmailConfigurado(env)) return { ok: false, motivo: "nao_configurado" };
  const f = opcoes.fetchFn ?? fetch;
  try {
    const r = await f("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.EMAIL_REMETENTE?.trim() || REMETENTE_PADRAO,
        to: [a.para],
        subject: a.assunto,
        html: a.html,
        text: a.texto,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return { ok: false, motivo: "recusado", status: r.status };
    const corpo = (await r.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: corpo?.id ?? null };
  } catch {
    return { ok: false, motivo: "rede" };
  }
}
