/**
 * Estado do token do Meta: reconhecer quando ele morreu e registrar isso.
 *
 * Existe por causa de um caso real. O token foi revogado no dia 21 e a tela
 * seguiu dizendo "Ativo — Recebendo leads automaticamente" por treze dias,
 * enquanto 15 leads empilhavam na fila de falhas. O app nunca escrevia de volta
 * na linha da conexão: `updated_at` era idêntico ao `created_at`. Quem descobriu
 * foi o dono do funil, pelo contador de falhas — não pelo sistema.
 *
 * Integração que quebra em silêncio e continua se declarando saudável é pior que
 * integração que cai com barulho: o cliente perde lead achando que está tudo bem.
 */
import type { GraphError } from "./meta-graph.server";

/** Subcódigos do erro 190 que o Facebook usa para dizer POR QUE o token morreu. */
const MOTIVO_POR_SUBCODIGO: Record<number, string> = {
  458: "O app foi removido das integrações do Facebook.",
  459: "A pessoa precisa fazer login de novo no Facebook.",
  460: "A senha do Facebook foi alterada.",
  463: "O token passou da validade.",
  464: "A pessoa não confirmou a conta no Facebook.",
  467: "O token foi invalidado porque a sessão do Facebook caiu.",
};

/**
 * O erro veio do Graph e significa "esse token não vale mais"?
 *
 * Só 190 e 401. O 200 e o 10 também derrubam a chamada, mas são permissão
 * faltando — o token continua válido e reconectar não resolve, então tratar os
 * dois como a mesma coisa mandaria o usuário para o lugar errado.
 */
export function tokenMorreu(erro: unknown): boolean {
  const e = erro as { status?: number; graph?: GraphError } | null;
  return e?.graph?.code === 190 || e?.status === 401;
}

/** Frase em português para a tela, a partir do subcódigo. */
export function motivoDaRevogacao(erro: unknown): string {
  const sub = (erro as { graph?: GraphError } | null)?.graph?.error_subcode;
  return (sub && MOTIVO_POR_SUBCODIGO[sub]) || "O Facebook invalidou o acesso.";
}

/**
 * Marca a conexão como revogada. Best-effort de propósito: isto roda dentro do
 * tratamento de um erro que já vai subir, e uma falha ao ANOTAR não pode
 * engolir nem substituir o erro original que o usuário precisa ver.
 */
export async function marcarConexaoRevogada(
  supabaseAdmin: { from: (t: string) => any },
  companyId: string,
  erro: unknown,
): Promise<void> {
  try {
    await supabaseAdmin
      .from("meta_lead_connections")
      .update({
        status: "revoked",
        // Não zera o token: guardá-lo não custa nada e some junto na reconexão,
        // enquanto apagar aqui destruiria a evidência de qual token falhou.
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", companyId);

    console.error(
      JSON.stringify({
        scope: "meta-token",
        msg: "conexao_revogada",
        company_id: companyId,
        subcode: (erro as { graph?: GraphError } | null)?.graph?.error_subcode ?? null,
        motivo: motivoDaRevogacao(erro),
      }),
    );
  } catch (falhaAoAnotar) {
    console.error(
      JSON.stringify({
        scope: "meta-token",
        msg: "falha_ao_marcar_revogada",
        company_id: companyId,
        erro: falhaAoAnotar instanceof Error ? falhaAoAnotar.message : String(falhaAoAnotar),
      }),
    );
  }
}
