import { segredoConfere } from "./segredo.server";

/**
 * Autorização das rotas de cron (`/api/public/cron/*`).
 *
 * Elas são PÚBLICAS: quem chama é o `pg_cron` pela internet. O que as protege é
 * um segredo no cabeçalho `Authorization`.
 *
 * Medido em 15/10/2026: `CRON_SECRET` NÃO está definido em produção, e o código
 * caía num texto padrão que está no repositório e nas migrações. Quem lê o código
 * dispara os lotes (envio de WhatsApp, conversão, webhooks) quando quiser.
 *
 * Fechar isso exige duas coisas AO MESMO TEMPO — definir `CRON_SECRET` no
 * servidor e trocar o cabeçalho nos jobs do `pg_cron` (há um script que gera o
 * SQL: `scripts/rotacionar-cron/`). Fazer só uma metade desliga a automação e a
 * conversão em silêncio. Por isso há dois modos:
 *
 *   • COM `CRON_SECRET`: só ele vale. O padrão antigo é recusado.
 *   • SEM `CRON_SECRET`: o padrão antigo ainda vale (comportamento de antes, para
 *     não parar nada num deploy) — e o aviso fica no log a cada chamada.
 *   • `CRON_ESTRITO=1` sem `CRON_SECRET`: responde 503. É o estado de chegada.
 */
export const SEGREDO_LEGADO = "altflow_retry_sync_secret";

export type AutorizacaoDeCron =
  { ok: true; modo: "segredo" | "legado" } | { ok: false; status: 401 | 503 };

export function autorizarCron(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): AutorizacaoDeCron {
  const enviado = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const segredo = env.CRON_SECRET?.trim();

  if (segredo) {
    return segredoConfere(enviado, segredo)
      ? { ok: true, modo: "segredo" }
      : { ok: false, status: 401 };
  }

  if (env.CRON_ESTRITO === "1") return { ok: false, status: 503 };

  if (segredoConfere(enviado, SEGREDO_LEGADO)) {
    console.warn(
      JSON.stringify({
        scope: "cron",
        msg: "segredo_legado_em_uso",
        aviso: "CRON_SECRET não está definido: a rota aceita o segredo padrão do repositório.",
      }),
    );
    return { ok: true, modo: "legado" };
  }
  return { ok: false, status: 401 };
}

/** Resposta pronta para quando `autorizarCron` recusa. */
export function respostaDeRecusa(a: Extract<AutorizacaoDeCron, { ok: false }>): Response {
  return new Response(a.status === 503 ? "Not configured" : "Unauthorized", { status: a.status });
}
