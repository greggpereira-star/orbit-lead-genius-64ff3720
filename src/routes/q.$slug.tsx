import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { z } from 'zod';
import { QuizPlayer } from '@/modules/quiz/components/QuizPlayer';

const searchSchema = z.object({
  preview: z.union([z.literal('1'), z.literal('true'), z.boolean()]).optional(),
});

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
  const { preview } = Route.useSearch();
  const isPreview = preview === '1' || preview === 'true' || preview === true;
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-black text-white/60 text-sm">
          Carregando quiz…
        </div>
      }
    >
      <QuizPlayer slug={slug} preview={isPreview} />
    </Suspense>
  );
}
