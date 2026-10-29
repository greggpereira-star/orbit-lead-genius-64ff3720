import { supabase } from "@/lib/supabase";
import type { QuizSchema } from "../types";

/**
 * O desenho do quiz que ESTE lead respondeu.
 *
 * A submissão guarda a versão (`version_id`); usar a publicada hoje traduziria
 * mal quem respondeu uma versão antiga, porque ids de opção mudam de uma
 * versão para outra. Sem submissão achada, cai na versão publicada.
 */
export async function lerSchemaDoLeadQuiz(params: {
  quizId: string;
  submissionId?: string | null;
}): Promise<QuizSchema | null> {
  const db = supabase as any;
  let versionId: string | null = null;

  if (params.submissionId) {
    const { data } = await db
      .from("quiz_submissions")
      .select("version_id")
      .eq("id", params.submissionId)
      .maybeSingle();
    versionId = (data as { version_id?: string | null } | null)?.version_id ?? null;
  }
  if (!versionId) {
    const { data } = await db
      .from("quiz_funnels")
      .select("published_version_id")
      .eq("id", params.quizId)
      .maybeSingle();
    versionId = (data as { published_version_id?: string | null } | null)?.published_version_id ?? null;
  }
  if (!versionId) return null;

  const { data } = await db.from("quiz_versions").select("schema").eq("id", versionId).maybeSingle();
  return ((data as { schema?: QuizSchema } | null)?.schema as QuizSchema | undefined) ?? null;
}
