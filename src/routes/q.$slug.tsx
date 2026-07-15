import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { QuizPlayer } from '@/modules/quiz/components/QuizPlayer';

export const Route = createFileRoute('/q/$slug')({
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
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-black text-white/60 text-sm">
          Carregando quiz…
        </div>
      }
    >
      <QuizPlayer slug={slug} />
    </Suspense>
  );
}
