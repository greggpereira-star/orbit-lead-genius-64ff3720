import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Plus, Sparkles } from 'lucide-react';
import { QuizList } from '@/modules/quiz/components/QuizList';
import { QuizCreateDialog } from '@/modules/quiz/components/QuizCreateDialog';

export const Route = createFileRoute('/_app/quizzes')({
  component: QuizzesPage,
});

function QuizzesPage() {
  const [dialog, setDialog] = useState<{ open: boolean; mode: 'blank' | 'template' }>({ open: false, mode: 'blank' });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Alt Quiz</h1>
          <p className="text-muted-foreground text-sm">
            Construa quizzes interativos de alta conversão — captação, qualificação e segmentação com experiência premium.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDialog({ open: true, mode: 'template' })} className="gap-2">
            <Sparkles className="h-4 w-4" /> Usar Template
          </Button>
          <Button onClick={() => setDialog({ open: true, mode: 'blank' })} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> Criar Quiz
          </Button>
        </div>
      </div>

      <QuizList
        onCreate={() => setDialog({ open: true, mode: 'blank' })}
        onUseTemplate={() => setDialog({ open: true, mode: 'template' })}
      />

      <QuizCreateDialog open={dialog.open} onOpenChange={(v) => setDialog((d) => ({ ...d, open: v }))} mode={dialog.mode} />
    </div>
  );
}
