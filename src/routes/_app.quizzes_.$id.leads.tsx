import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { QuizLeadsBoard } from '@/modules/quiz/components/QuizLeadsBoard';

export const Route = createFileRoute('/_app/quizzes_/$id/leads')({
  component: QuizLeadsPage,
});

function QuizLeadsPage() {
  const { id } = useParams({ from: '/_app/quizzes_/$id/leads' });
  const { company } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/quizzes"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads do quiz</h1>
          <p className="text-sm text-muted-foreground">Visitantes e leads gerados por este funil, organizados por etapa.</p>
        </div>
      </div>

      {company?.id && <QuizLeadsBoard quizId={id} companyId={company.id} />}
    </div>
  );
}
