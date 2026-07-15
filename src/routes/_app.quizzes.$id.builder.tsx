import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Wand2 } from 'lucide-react';

export const Route = createFileRoute('/_app/quizzes/$id/builder')({
  component: QuizBuilderPage,
});

function QuizBuilderPage() {
  const { id } = useParams({ from: '/_app/quizzes/$id/builder' });
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/quizzes"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Builder</h1>
          <p className="text-xs text-muted-foreground">Quiz {id}</p>
        </div>
      </div>
      <Card className="p-16 text-center border-dashed">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Wand2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-lg font-bold mb-2">Builder chega na Fase 2</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          A fundação (banco, rotas, criação de quiz por template) está pronta. O editor visual de 3 colunas com preview live entra na próxima entrega.
        </p>
      </Card>
    </div>
  );
}
