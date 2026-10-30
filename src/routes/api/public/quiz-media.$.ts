import { createFileRoute } from '@tanstack/react-router';
import { caminhoValido } from '@/modules/quiz/lib/midiaEstavel';

/**
 * Endereço estável da mídia do quiz.
 *
 * O bucket é privado; antes o schema guardava uma URL assinada de 1 ano e, vencida,
 * toda mídia de quiz publicado quebrava em silêncio. Aqui cada acesso assina uma URL
 * nova de curta duração e redireciona — o endereço que fica no schema nunca vence.
 *
 * Só serve o bucket `quiz-media` e só caminhos no formato esperado (sem `..`).
 * Quem tem o caminho (que tem UUID) já tinha a URL assinada: a exposição é a mesma.
 */
const BUCKET = 'quiz-media';
const VALIDADE_SEGUNDOS = 60 * 60; // a URL de destino; o redirect é refeito quando vence

export const Route = createFileRoute('/api/public/quiz-media/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const caminho = (params as { _splat?: string })._splat ?? '';
        if (!caminhoValido(caminho)) return new Response('Not found', { status: 404 });

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(caminho, VALIDADE_SEGUNDOS);
        if (error || !data?.signedUrl) return new Response('Not found', { status: 404 });

        return new Response(null, {
          status: 302,
          headers: {
            Location: data.signedUrl,
            // O navegador reaproveita o redirect por pouco tempo (menos idas ao servidor),
            // sempre bem antes de a URL de destino vencer.
            'Cache-Control': 'public, max-age=600',
          },
        });
      },
    },
  },
});
