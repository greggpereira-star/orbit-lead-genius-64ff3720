/**
 * Tira o contato do opt-out: limpa a marca no contato e remove o telefone da lista usada pela
 * política de envio. As DUAS, porque o envio consulta as duas (`opted_out_at` e `whatsapp_optouts`)
 * e uma sobrando mantém o bloqueio.
 */
import { variantesDoNumero } from "../numero";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (t: string) => any };

export async function reativarContato(
  db: Db,
  empresa: { companyId: string; waId: string },
): Promise<{ ok: true } | { ok: false; texto: string }> {
  const { error: e1 } = await db
    .from("wa_contacts")
    .update({ opted_out_at: null })
    .eq("company_id", empresa.companyId)
    .eq("wa_id", empresa.waId);
  if (e1) return { ok: false, texto: "Não consegui reativar o contato." };

  const { error: e2 } = await db
    .from("whatsapp_optouts")
    .delete()
    .eq("company_id", empresa.companyId)
    .in("phone", variantesDoNumero(empresa.waId));
  if (e2) return { ok: false, texto: "Não consegui reativar o contato." };
  return { ok: true };
}
