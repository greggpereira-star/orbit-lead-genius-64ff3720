/**
 * Recebe a resposta em vídeo gravada pelo visitante.
 *
 * O visitante é ANÔNIMO, e por isso ele não escreve no bucket: manda o arquivo
 * para cá e o servidor grava com a chave de serviço. A diferença importa —
 * abrir escrita anônima no `quiz-media` daria a qualquer pessoa com a URL um
 * lugar para hospedar o que quisesse, e sem como distinguir de um envio
 * legítimo depois.
 *
 * O que o endereço exige antes de gravar um byte:
 *   1. o quiz existe, está PUBLICADO e não está arquivado;
 *   2. o bloco citado existe nesse quiz e é mesmo do tipo `video-answer`;
 *   3. o arquivo passa nos limites de tamanho, tipo e duração.
 *
 * Sem o item 2, bastaria o id de qualquer quiz publicado para transformar isto
 * em hospedagem grátis.
 */
import { createFileRoute } from "@tanstack/react-router";
import { validarEnvioDeVideo, caminhoDoVideo } from "@/modules/quiz/lib/videoResposta";

const BUCKET = "quiz-media";
const TTL_URL_ASSINADA = 60 * 60 * 24 * 365; // 1 ano, o teto do Supabase

export const Route = createFileRoute("/api/public/quiz-video-answer")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const recusa = (motivo: string, status = 400) =>
          new Response(JSON.stringify({ erro: motivo }), {
            status,
            headers: { "Content-Type": "application/json" },
          });

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return recusa("Envio inválido.");
        }

        const arquivo = form.get("video");
        const quizId = String(form.get("quizId") ?? "");
        const blockId = String(form.get("blockId") ?? "");
        const sessionId = String(form.get("sessionId") ?? "");
        const segundos = Number(form.get("segundos") ?? NaN);

        if (!(arquivo instanceof File)) return recusa("Arquivo ausente.");
        if (!quizId || !blockId || !sessionId) return recusa("Dados incompletos.");

        const problema = validarEnvioDeVideo({
          bytes: arquivo.size,
          mimeType: arquivo.type,
          segundos: Number.isFinite(segundos) ? segundos : undefined,
        });
        if (problema) return recusa(problema.motivo);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. o quiz precisa estar no ar
        const { data: quiz } = await supabaseAdmin
          .from("quiz_funnels")
          .select("id, company_id, status, archived_at, published_version_id")
          .eq("id", quizId)
          .maybeSingle();
        const q = quiz as {
          id: string;
          company_id: string;
          status: string;
          archived_at: string | null;
          published_version_id: string | null;
        } | null;
        if (!q || q.status !== "published" || q.archived_at) {
          return recusa("Quiz indisponível.", 404);
        }

        // 2. o bloco citado precisa existir NESTE quiz e ser de vídeo
        const { data: versao } = await supabaseAdmin
          .from("quiz_versions")
          .select("schema")
          .eq("id", q.published_version_id ?? "")
          .maybeSingle();
        const blocos =
          (versao as { schema?: { blocks?: { id: string; type: string }[] } } | null)?.schema
            ?.blocks ?? [];
        const bloco = blocos.find((b) => b.id === blockId);
        if (!bloco || bloco.type !== "video-answer") {
          return recusa("Bloco inválido para envio de vídeo.", 404);
        }

        const id = crypto.randomUUID();
        const caminho = caminhoDoVideo(q.company_id, q.id, id);

        const { error: erroUpload } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(caminho, arquivo, { contentType: "video/webm", upsert: false });
        if (erroUpload) return recusa("Não foi possível salvar o vídeo.", 500);

        const { data: assinada } = await supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUrl(caminho, TTL_URL_ASSINADA);

        return new Response(JSON.stringify({ url: assinada?.signedUrl ?? null, caminho }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
