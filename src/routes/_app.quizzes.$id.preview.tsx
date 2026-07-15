import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/_app/quizzes/$id/preview')({
  component: QuizPreviewPage,
});

function QuizPreviewPage() {
  const { id } = useParams({ from: '/_app/quizzes/$id/preview' });
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/quizzes"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Preview</h1>
      </div>
      <Card className="p-12 text-center text-sm text-muted-foreground">
        Preview do quiz {id} — disponível a partir da Fase 2.
      </Card>
    </div>
  );
}
