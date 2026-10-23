/**
 * Em qual número abrir a conversa quando a automação manda um TEMPLATE.
 *
 * Template pertence à conta (WABA) e o envio procura o template na conta do número da conversa.
 * Abrir a conversa "no primeiro número da empresa" dava "Template não encontrado" sempre que a
 * empresa tinha mais de um número e o template era de outra conta (caso medido em 23/10/2026).
 * Aqui o número sai do TEMPLATE: acha a(s) conta(s) em que ele está aprovado e pega um número
 * ativo dela.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (t: string) => any };

export type NumeroDoTemplate =
  { ok: true; numeroId: string; contaId: string } | { ok: false; texto: string };

export async function numeroDoTemplate(
  db: Db,
  e: {
    companyId: string;
    nome: string;
    idioma: string;
    /** Conta escolhida na regra, quando há; sem ela vale qualquer conta da empresa com o template. */
    contaId?: string | null;
  },
): Promise<NumeroDoTemplate> {
  let q = db
    .from("wa_templates")
    .select("account_id")
    .eq("company_id", e.companyId)
    .eq("name", e.nome)
    .eq("language", e.idioma)
    .eq("status", "APPROVED");
  if (e.contaId) q = q.eq("account_id", e.contaId);
  const { data: modelos, error } = await q;
  if (error) return { ok: false, texto: "Não consegui consultar os templates." };

  const contas = [
    ...new Set(((modelos ?? []) as Array<{ account_id: string }>).map((m) => m.account_id)),
  ];
  if (contas.length === 0) {
    return { ok: false, texto: "Template não encontrado ou não aprovado em nenhuma conta." };
  }

  const { data: numeros, error: erroNumeros } = await db
    .from("wa_phone_numbers")
    .select("id, account_id, receive_only")
    .eq("company_id", e.companyId)
    .eq("status", "active")
    .in("account_id", contas)
    .order("created_at", { ascending: true });
  if (erroNumeros) return { ok: false, texto: "Não consegui consultar os números." };

  // Número apenas receptivo não manda template (mensagem ativa), então não serve de destino.
  const escolhido = (
    (numeros ?? []) as Array<{
      id: string;
      account_id: string;
      receive_only: boolean | null;
    }>
  ).find((n) => n.receive_only !== true);
  if (!escolhido) {
    return { ok: false, texto: "Nenhum número ativo (e que envie) na conta do template." };
  }
  return { ok: true, numeroId: escolhido.id, contaId: escolhido.account_id };
}
