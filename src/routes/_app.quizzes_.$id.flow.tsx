import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { quizService } from '@/modules/quiz/services/quizService';
import { getSteps } from '@/modules/quiz/lib/steps';
import { QuizFlowView } from '@/modules/quiz/components/QuizFlowView';
import { DEFAULT_DESIGN } from '@/modules/quiz/design-presets';
import type { QuizBlock, QuizFunnel, QuizSchema, QuizStep } from '@/modules/quiz/types';

export const Route = createFileRoute('/_app/quizzes_/$id/flow')({
  component: QuizFlowPage,
});

function QuizFlowPage() {
  const { id } = useParams({ from: '/_app/quizzes_/$id/flow' });
  const { company, user } = useAuth();
  const [quiz, setQuiz] = useState<QuizFunnel | null>(null);
  const [schema, setSchema] = useState<QuizSchema>({ blocks: [], design: DEFAULT_DESIGN, results: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([quizService.getById(id), quizService.getLatestSchema(id)]).then(([q, s]) => {
      if (!mounted) return;
      setQuiz(q);
      // materializa schema.steps já na primeira carga (mesmo padrão do Builder) — assim
      // renomear/marcar meta/excluir sempre opera sobre uma lista de etapas explícita,
      // mesmo em quizzes antigos que nunca tiveram `steps` gravado.
      setSchema({ ...s, steps: getSteps(s) });
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [id]);

  const updateSchema = (updater: (prev: QuizSchema) => QuizSchema) => {
    setSchema((prev) => updater(prev));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!company?.id || !user?.id) return;
    setSaving(true);
    try {
      await quizService.saveSchema({ quizId: id, companyId: company.id, userId: user.id, schema });
      setDirty(false);
      setSaveError(false);
      setLastSavedAt(new Date());
    } catch (e) {
      console.error('Erro ao salvar fluxograma', e);
      setSaveError(true);
      toast.error('Não foi possível salvar as alterações do fluxograma. Tente de novo.');
    } finally {
      setSaving(false);
    }
  };

  // Autosave (mesmo padrão do Builder): evita que uma edição feita aqui no fluxograma
  // (renomear, excluir, marcar meta, inserir etapa) fique só nesta aba.
  useEffect(() => {
    if (!dirty || loading) return;
    const timer = setTimeout(() => { handleSave(); }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, dirty, loading]);

  const renameStep = (stepId: string, name: string | undefined) => {
    updateSchema((prev) => ({
      ...prev,
      steps: getSteps(prev).map((s) => (s.id === stepId ? { ...s, name } : s)),
    }));
  };

  const toggleGoal = (stepId: string) => {
    updateSchema((prev) => ({
      ...prev,
      steps: getSteps(prev).map((s) => (s.id === stepId ? { ...s, isGoal: !s.isGoal } : s)),
    }));
  };

  const deleteStep = (stepId: string) => {
    const currentSteps = getSteps(schema);
    const idx = currentSteps.findIndex((s) => s.id === stepId);
    if (idx === -1) return;
    const removedStep = currentSteps[idx];
    const removedBlockIds = new Set(removedStep.blockIds);
    const removedBlocks = schema.blocks.filter((b) => removedBlockIds.has(b.id));
    const blockIndex = schema.blocks.findIndex((b) => removedBlockIds.has(b.id));

    updateSchema((prev) => {
      const nextBlocks = prev.blocks
        .filter((b) => !removedBlockIds.has(b.id))
        // limpa qualquer ramificação que apontava pra um bloco removido — sem isso
        // sobraria uma seta "fantasma" mirando numa etapa que não existe mais.
        .map((b) => ({
          ...b,
          options: b.options?.map((o) =>
            o.jumpToBlockId && removedBlockIds.has(o.jumpToBlockId) ? { ...o, jumpToBlockId: undefined } : o
          ),
          logicRules: b.logicRules?.filter((r) => !removedBlockIds.has(r.jumpToBlockId)),
        }));
      const nextSteps = getSteps(prev).filter((s) => s.id !== stepId);
      return { ...prev, blocks: nextBlocks, steps: nextSteps };
    });

    toast('Etapa excluída', {
      description: removedStep.name || removedBlocks[0]?.title || `${removedBlocks.length} módulo(s)`,
      action: {
        label: 'Desfazer',
        onClick: () => {
          updateSchema((prev) => {
            const restoredSteps = Array.from(getSteps(prev));
            restoredSteps.splice(Math.min(idx, restoredSteps.length), 0, removedStep);
            const nextBlocks = Array.from(prev.blocks);
            nextBlocks.splice(blockIndex >= 0 ? blockIndex : nextBlocks.length, 0, ...removedBlocks);
            return { ...prev, blocks: nextBlocks, steps: restoredSteps };
          });
        },
      },
    });
  };

  const insertStepAfter = (stepId: string) => {
    const newBlock: QuizBlock = {
      id: crypto.randomUUID(),
      type: 'argument',
      title: 'Nova etapa',
      subtitle: 'Edite este conteúdo no Builder',
    };
    updateSchema((prev) => {
      const steps = getSteps(prev);
      const idx = steps.findIndex((s) => s.id === stepId);
      const newStep: QuizStep = { id: `step-${newBlock.id}`, blockIds: [newBlock.id] };
      const nextSteps = Array.from(steps);
      nextSteps.splice(idx + 1, 0, newStep);
      return { ...prev, blocks: [...prev.blocks, newBlock], steps: nextSteps };
    });
    toast.success('Etapa inserida — edite o conteúdo dela no Builder.');
  };

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
        <div className="ml-auto">
          {saveError ? (
            <button
              onClick={() => handleSave()}
              className="flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
              title="Falha ao salvar — clique para tentar de novo"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="hidden min-[420px]:inline">Erro — tentar de novo</span>
            </button>
          ) : (
            <div
              className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium ${
                saving
                  ? 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                  : dirty
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              }`}
              aria-live="polite"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <span className={`h-1.5 w-1.5 rounded-full ${dirty ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              )}
              <span className="hidden min-[420px]:inline">
                {saving
                  ? 'Salvando…'
                  : dirty
                    ? 'Não salvo'
                    : lastSavedAt
                      ? `Salvo ${lastSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Salvo'}
              </span>
            </div>
          )}
        </div>
      </header>
      <div className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <QuizFlowView
            schema={schema}
            onRenameStep={renameStep}
            onToggleGoal={toggleGoal}
            onDeleteStep={deleteStep}
            onInsertStepAfter={insertStepAfter}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
