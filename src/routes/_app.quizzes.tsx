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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Alt Quiz</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Construa quizzes interativos de alta conversão — captação, qualificação e segmentação com experiência premium.
          </p>
        </div>
        <div className="flex flex-col min-[420px]:flex-row gap-2 shrink-0">
          <Button variant="outline" onClick={() => setDialog({ open: true, mode: 'template' })} className="gap-2 w-full min-[420px]:w-auto">
            <Sparkles className="h-4 w-4" /> Usar Template
          </Button>
          <Button onClick={() => setDialog({ open: true, mode: 'blank' })} className="gap-2 shadow-lg shadow-primary/20 w-full min-[420px]:w-auto">
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
