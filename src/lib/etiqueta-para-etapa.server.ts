/**
 * Etiqueta no WhatsApp → etapa no CRM (o caminho de volta).
 *
 * Etiqueta e etapa são o MESMO estado, visto de dois lugares. Quem etiqueta no
 * aparelho move o card aqui; quem move o card aplica a etiqueta lá. Como o
 * evento de conversão dispara na TRANSIÇÃO de etapa, e não no mecanismo que a
 * causou, as duas portas levam a um evento só.
 *
 * Isso também fecha o laço sem risco de ciclo: etiquetar move a etapa, o
 * despachante reaplica a etiqueta (no-op no aparelho), a Evolution reemite o
 * evento, e aí a etapa JÁ é aquela — o gatilho do banco compara
 * `IS NOT DISTINCT FROM` e não enfileira nada. O laço morre na segunda volta.
 */

/** Deriva o status igual ao board faz, senão os dois caminhos divergem. */
function statusDaEtapa(
  etapa: { id: string; kind: string | null },
  todas: Array<{ id: string; kind: string | null }>,
): string {
  if (etapa.kind === "won") return "won";
  if (etapa.kind === "lost") return "lost";
  const primeiraAberta = todas.find((s) => s.kind === "open");
  return primeiraAberta?.id === etapa.id ? "new" : "contacted";
}

/** Só dígitos, como o resto do sistema guarda telefone. */
const soDigitos = (v: string) => v.replace(/\D+/g, "");

export async function moverLeadPelaEtiqueta(
  admin: { from: (t: string) => any },
  entrada: {
    companyId: string;
    instanceName: string;
    chatId: string;
    labelId: string;
    /** 'add' move; 'remove' não faz nada (ver comentário abaixo). */
    tipo: string;
  },
): Promise<{ movido: boolean; motivo?: string }> {
  // Tirar etiqueta NÃO desfaz a etapa. Para onde o lead voltaria? A etapa
  // anterior pode ter sido pulada, e adivinhar moveria o card para um lugar que
  // ninguém pediu. Remover etiqueta é desfazer uma marcação, não desfazer um
  // avanço no funil.
  if (entrada.tipo !== "add") return { movido: false, motivo: "remoção não move etapa" };

  const telefone = soDigitos(entrada.chatId.split("@")[0] ?? "");
  if (!telefone) return { movido: false, motivo: "chatId sem telefone" };

  // O webhook manda o ID da etiqueta, não o nome — e nome é o que o usuário
  // configurou. A tradução depende de consultar a Evolution.
  const { listarEtiquetas } = await import("@/lib/evolution.server");
  const etiquetas = await listarEtiquetas(entrada.instanceName);
  if (!etiquetas.ok) return { movido: false, motivo: `não consegui ler as etiquetas: ${etiquetas.error}` };

  const nome = (etiquetas.data ?? []).find((e) => e.id === entrada.labelId)?.name?.trim();
  if (!nome) return { movido: false, motivo: "etiqueta desconhecida" };

  const { data: mapa } = await admin
    .from("stage_conversion_mappings")
    .select("stage_id")
    .eq("company_id", entrada.companyId)
    .ilike("whatsapp_label", nome)
    .eq("is_active", true)
    .maybeSingle();

  // Etiqueta que ninguém configurou é uso legítimo do WhatsApp — o time usa
  // etiqueta para muita coisa que não é funil. Ignorar em silêncio é o certo.
  if (!mapa?.stage_id) return { movido: false, motivo: "etiqueta sem etapa configurada" };

  // Casa pelos 8 últimos dígitos, mesma regra do resto do webhook: o nono dígito
  // do celular brasileiro aparece ou não conforme a origem do número.
  const { data: lead } = await admin
    .from("leads")
    .select("id, stage_id")
    .eq("company_id", entrada.companyId)
    .ilike("phone", `%${telefone.slice(-8)}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lead?.id) return { movido: false, motivo: "nenhum lead com esse telefone" };
  if (lead.stage_id === mapa.stage_id) return { movido: false, motivo: "lead já está nessa etapa" };

  const { data: etapas } = await admin
    .from("stages")
    .select("id, kind")
    .eq("company_id", entrada.companyId)
    .order("order_index");

  const lista = (etapas ?? []) as Array<{ id: string; kind: string | null }>;
  const alvo = lista.find((s) => s.id === mapa.stage_id);
  if (!alvo) return { movido: false, motivo: "etapa não existe mais" };

  const { error } = await admin
    .from("leads")
    .update({
      stage_id: mapa.stage_id,
      stage_entered_at: new Date().toISOString(),
      status: statusDaEtapa(alvo, lista),
      updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  if (error) return { movido: false, motivo: error.message };

  console.info(
    JSON.stringify({
      scope: "etiqueta-etapa",
      msg: "lead_movido_por_etiqueta",
      company_id: entrada.companyId,
      etiqueta: nome,
      stage_id: mapa.stage_id,
    }),
  );

  return { movido: true };
}
