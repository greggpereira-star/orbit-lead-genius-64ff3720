import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';
import { QuizPlayer } from '@/modules/quiz/components/QuizPlayer';

const searchSchema = z.object({
  preview: z.union([z.literal('1'), z.literal('true'), z.boolean()]).optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
  utm_content: z.string().optional(),
  utm_term: z.string().optional(),
  fbclid: z.string().optional(),
  gclid: z.string().optional(),
});

const TRACKING_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'gclid'] as const;

export const Route = createFileRoute('/q/$slug')({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: 'Quiz interativo' },
      { name: 'description', content: 'Responda o quiz e receba seu resultado personalizado.' },
      { property: 'og:title', content: 'Quiz interativo' },
      { property: 'og:description', content: 'Responda o quiz e receba seu resultado personalizado.' },
    ],
  }),
  component: QuizPage,
});

function QuizPage() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const isPreview = search.preview === '1' || search.preview === 'true' || search.preview === true;
  const tracking: Record<string, string> = {};
  for (const key of TRACKING_KEYS) {
    const value = search[key];
    if (value) tracking[key] = value;
  }
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-black text-white/60 text-sm">
          Carregando quiz…
        </div>
      }
    >
      <QuizPlayer slug={slug} preview={isPreview} tracking={tracking} />
    </Suspense>
  );
}
