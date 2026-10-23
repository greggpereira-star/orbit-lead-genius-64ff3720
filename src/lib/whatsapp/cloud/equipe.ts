/**
 * Regras de equipe do atendimento: quem pode ser MENCIONADO numa nota e quem pode ser RESPONSÁVEL
 * por uma conversa. Eram trechos soltos dentro das funções do servidor, sem como testar sem um
 * segundo usuário; aqui são funções puras sobre um cliente de banco.
 */
import { podeAtender } from "./../papeis";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (t: string) => any };

/**
 * Registra as menções de uma nota. Só vale para quem é membro DESTA empresa e nunca para si mesmo
 * (o RLS por si só aceitaria qualquer uuid). Quem é mencionado passa a seguir a conversa.
 */
export async function registrarMencoes(
  db: Db,
  e: {
    companyId: string;
    conversaId: string;
    notaId: string;
    autorId: string;
    mencionar: string[] | undefined;
    seguir: (userId: string) => Promise<void>;
  },
): Promise<{ mencionados: string[] }> {
  const alvos = [...new Set(e.mencionar ?? [])].filter((id) => id !== e.autorId);
  if (alvos.length === 0) return { mencionados: [] };

  const { data: membros } = await db
    .from("memberships")
    .select("user_id")
    .eq("company_id", e.companyId)
    .in("user_id", alvos);
  const validos = ((membros ?? []) as Array<{ user_id: string }>).map((m) => m.user_id);
  if (validos.length === 0) return { mencionados: [] };

  await db.from("wa_mentions").insert(
    validos.map((uid) => ({
      company_id: e.companyId,
      conversation_id: e.conversaId,
      note_id: e.notaId,
      mentioned_user_id: uid,
      author_id: e.autorId,
    })),
  );
  await Promise.all(validos.map((uid) => e.seguir(uid).catch(() => {})));
  return { mencionados: validos };
}

/**
 * O destino de uma atribuição precisa ser membro DESTA empresa e poder atender: quem só lê não
 * pode ser responsável, senão a conversa ficaria sem ninguém que responda. `null` (desatribuir)
 * sempre vale.
 */
export async function validarResponsavel(
  db: Db,
  companyId: string,
  userId: string | null,
): Promise<{ ok: true } | { ok: false; texto: string }> {
  if (!userId) return { ok: true };
  const { data: m } = await db
    .from("memberships")
    .select("user_id, role")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!m) return { ok: false, texto: "Este atendente não pertence à empresa." };
  if (!podeAtender(String(m.role))) {
    return {
      ok: false,
      texto: "Este usuário tem acesso somente leitura e não pode ser responsável.",
    };
  }
  return { ok: true };
}
