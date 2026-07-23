import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';
import { QuizPlayer } from '@/modules/quiz/components/QuizPlayer';
import { quizService } from '@/modules/quiz/services/quizService';

const searchSchema = z.object({
  preview: z.union([z.literal('1'), z.literal('true'), z.literal(1), z.boolean()]).optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  fbclid: z.string().optional(),
  gclid: z.string().optional(),
});

const TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'] as const;

const DEFAULT_TITLE = 'Quiz interativo';
const DEFAULT_DESCRIPTION = 'Responda o quiz e receba seu resultado personalizado.';

export const Route = createFileRoute('/q/$slug')({
  validateSearch: (s) => searchSchema.parse(s),
  loader: async ({ params }) => {
    const data = await quizService.getPublishedBySlug(params.slug).catch(() => null);
    const settings = (data?.quiz.settings ?? {}) as Record<string, unknown>;
    return {
      seoTitle: (settings.seo_title as string) || data?.quiz.name || DEFAULT_TITLE,
      seoDescription: (settings.seo_description as string) || DEFAULT_DESCRIPTION,
      seoOgImage: (settings.seo_og_image as string) || undefined,
      customHeadScript: (settings.custom_head_script as string) || undefined,
    };
  },
  head: ({ loaderData }) => {
    const title = loaderData?.seoTitle ?? DEFAULT_TITLE;
    const description = loaderData?.seoDescription ?? DEFAULT_DESCRIPTION;
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        ...(loaderData?.seoOgImage ? [{ property: 'og:image', content: loaderData.seoOgImage }] : []),
      ],
    };
  },
  component: QuizPage,
});

function QuizPage() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const isPreview = search.preview === '1' || search.preview === 'true' || search.preview === 1 || search.preview === true;
  const tracking: Record<string, string> = {};
  for (const key of TRACKING_KEYS) {
    const value = search[key];
    if (value) tracking[key] = value;
  }
  return (
    <>
      {loaderData?.customHeadScript && (
        <script dangerouslySetInnerHTML={{ __html: loaderData.customHeadScript }} />
      )}
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-black text-white/60 text-sm">
            Carregando quiz…
          </div>
        }
      >
        <QuizPlayer slug={slug} preview={isPreview} tracking={tracking} />
      </Suspense>
    </>
  );
}
