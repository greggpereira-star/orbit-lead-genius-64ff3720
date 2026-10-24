/**
 * Quem enxerga qual conversa do WhatsApp.
 *
 * Por empresa, o modo é "todas" (padrão: todo membro vê tudo, como sempre foi)
 * ou "so_minhas": o atendente (`member`/`viewer`) só vê as conversas que são
 * dele. Dono e administrador veem tudo nos dois modos.
 *
 * No modo "so_minhas" a conversa é visível quando:
 *   - está atribuída à pessoa;
 *   - não tem responsável e a empresa deixa ver a fila (`verFila`);
 *   - a pessoa a segue;
 *   - a pessoa foi mencionada numa nota dela.
 *
 * A mesma regra existe no banco (`pode_ver_conversa`), que vale para a lista e
 * o tempo real. Esta versão vale para as server functions, que usam a chave de
 * serviço e por isso passam por cima do RLS.
 */

export type ModoDeVisibilidade = "todas" | "so_minhas";

export type ConfigDeVisibilidade = { modo: ModoDeVisibilidade; verFila: boolean };

export const VISIBILIDADE_PADRAO: ConfigDeVisibilidade = { modo: "todas", verFila: true };

const ADMINISTRAM: ReadonlySet<string> = new Set(["owner", "admin"]);

export function normalizarConfig(raw: unknown): ConfigDeVisibilidade {
  const r = (raw ?? {}) as { modo?: unknown; ver_fila?: unknown; verFila?: unknown };
  const modo: ModoDeVisibilidade = r.modo === "so_minhas" ? "so_minhas" : "todas";
  const fila = r.ver_fila ?? r.verFila;
  return { modo, verFila: fila === false ? false : true };
}

export function decidirVisibilidade(a: {
  config: ConfigDeVisibilidade;
  papel: string;
  userId: string;
  assignedTo: string | null;
  segue: boolean;
  mencionado: boolean;
}): boolean {
  if (ADMINISTRAM.has(a.papel)) return true;
  if (a.config.modo !== "so_minhas") return true;
  if (a.assignedTo === a.userId) return true;
  if (a.assignedTo === null && a.config.verFila) return true;
  return a.segue || a.mencionado;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function configDaEmpresa(admin: any, companyId: string): Promise<ConfigDeVisibilidade> {
  const { data } = await admin
    .from("wa_visibilidade")
    .select("modo, ver_fila")
    .eq("company_id", companyId)
    .maybeSingle();
  return data ? normalizarConfig(data) : VISIBILIDADE_PADRAO;
}

/**
 * A pessoa pode ver/agir nesta conversa? No modo "todas" (o comum) responde com
 * uma única consulta, a da configuração; papel, seguidores e menções só são
 * consultados quando a empresa está no modo restrito.
 */
export async function podeVerConversa(
  admin: any,
  a: { companyId: string; userId: string; conversaId: string; assignedTo: string | null },
): Promise<boolean> {
  const config = await configDaEmpresa(admin, a.companyId);
  if (config.modo !== "so_minhas") return true;

  const { data: membro } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", a.userId)
    .eq("company_id", a.companyId)
    .maybeSingle();
  // Sem vínculo com a empresa não vê nada; papel desconhecido vale como o menor.
  if (!membro) return false;
  const papel = String(membro.role ?? "viewer");
  const base = { config, papel, userId: a.userId, assignedTo: a.assignedTo };
  if (decidirVisibilidade({ ...base, segue: false, mencionado: false })) return true;

  const [{ data: seguidor }, { data: mencao }] = await Promise.all([
    admin
      .from("wa_conversation_followers")
      .select("user_id")
      .eq("conversation_id", a.conversaId)
      .eq("user_id", a.userId)
      .maybeSingle(),
    admin
      .from("wa_mentions")
      .select("id")
      .eq("conversation_id", a.conversaId)
      .eq("mentioned_user_id", a.userId)
      .limit(1)
      .maybeSingle(),
  ]);
  return decidirVisibilidade({ ...base, segue: !!seguidor, mencionado: !!mencao });
}
