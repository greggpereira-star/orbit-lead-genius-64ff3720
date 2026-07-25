/**
 * Em que etapa do funil um lead recém-criado deve entrar (lado servidor).
 *
 * Gêmeo de `resolveEntryStage` em `src/modules/crm/services/stageService.ts`,
 * que roda no browser com o client autenticado. Aqui o acesso é pelo client
 * admin, porque a ingestão do Meta acontece sem usuário logado.
 *
 * A etapa preferida vem da configuração da integração e é validada contra as
 * etapas da empresa antes de ser usada: ela pode ter sido excluída depois de
 * configurada, e um `stage_id` órfão deixa o lead invisível no pipeline.
 */
type Admin = any;

export async function resolveEntryStageId(
  admin: Admin,
  companyId: string,
  preferredStageId: string | null,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("stages")
      .select("id, is_entry, order_index")
      .eq("company_id", companyId)
      .order("order_index");

    const stages = (data ?? []) as Array<{ id: string; is_entry: boolean }>;
    if (!stages.length) return null;

    if (preferredStageId && stages.some((s) => s.id === preferredStageId)) {
      return preferredStageId;
    }
    return (stages.find((s) => s.is_entry) ?? stages[0]).id;
  } catch {
    // Sem etapa o lead ainda entra — aparece em "Sem etapa" no board, que é
    // recuperável. Derrubar a ingestão por causa disso perderia o lead.
    return null;
  }
}
