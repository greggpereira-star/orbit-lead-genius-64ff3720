import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { quizService } from '@/modules/quiz/services/quizService';
import { QuizFlowView } from '@/modules/quiz/components/QuizFlowView';
import { DEFAULT_DESIGN } from '@/modules/quiz/design-presets';
import type { QuizFunnel, QuizSchema } from '@/modules/quiz/types';

export const Route = createFileRoute('/_app/quizzes_/$id/flow')({
  component: QuizFlowPage,
});

function QuizFlowPage() {
  const { id } = useParams({ from: '/_app/quizzes_/$id/flow' });
  const [quiz, setQuiz] = useState<QuizFunnel | null>(null);
  const [schema, setSchema] = useState<QuizSchema>({ blocks: [], design: DEFAULT_DESIGN, results: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([quizService.getById(id), quizService.getLatestSchema(id)]).then(([q, s]) => {
      if (!mounted) return;
      setQuiz(q);
      setSchema(s);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [id]);

  return createPortal(
    <div className="fixed inset-0 flex flex-col bg-background z-40">
      <header className="h-14 border-b flex items-center gap-3 px-4 shrink-0">
        <Button asChild variant="ghost" size="sm">
          <Link to="/quizzes/$id/builder" params={{ id }}><ArrowLeft className="h-4 w-4 mr-2" />Voltar ao Builder</Link>
        </Button>
        <div className="border-l pl-3">
          <h1 className="font-bold text-sm leading-none">{quiz?.name ?? 'Quiz'}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Fluxograma</p>
        </div>
      </header>
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <QuizFlowView schema={schema} />
        )}
      </div>
    </div>,
    document.body
  );
}
