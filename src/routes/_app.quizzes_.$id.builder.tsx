import { createFileRoute, Link, useParams, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Save,
  Eye,
  Loader2,
  Smartphone,
  Tablet,
  Monitor,
  Palette,
  Plus,
  GripVertical,
  Trash2,
  ShieldCheck,
  LayoutGrid,
  SlidersHorizontal,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { quizService } from '@/modules/quiz/services/quizService';
import { QuizPreview } from '@/modules/quiz/components/QuizPreview';
import { QuizInspector } from '@/modules/quiz/components/QuizInspector';
import { AccessRulesDialog } from '@/modules/quiz/components/AccessRulesDialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { BLOCK_LIBRARY } from '@/modules/quiz/blocks-library';
import { DEFAULT_DESIGN } from '@/modules/quiz/design-presets';
import type { QuizBlock, QuizFunnel, QuizSchema } from '@/modules/quiz/types';

export const Route = createFileRoute('/_app/quizzes_/$id/builder')({
  component: QuizBuilderPage,
});

function QuizBuilderPage() {
  const { id } = useParams({ from: '/_app/quizzes_/$id/builder' });
  const { company, user } = useAuth();
  const navigate = useNavigate();

  const [quiz, setQuiz] = useState<QuizFunnel | null>(null);
  const [schema, setSchema] = useState<QuizSchema>({ blocks: [], design: DEFAULT_DESIGN, results: [] });
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [device, setDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [accessRulesOpen, setAccessRulesOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'blocks' | 'inspector' | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [q, s] = await Promise.all([quizService.getById(id), quizService.getLatestSchema(id)]);
        if (!mounted) return;
        setQuiz(q);
        setSchema(s);
      } catch (e) {
        toast.error('Erro ao carregar quiz: ' + (e instanceof Error ? e.message : String(e)));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const activeBlock = useMemo(
    () => schema.blocks.find((b) => b.id === activeBlockId) ?? null,
    [schema.blocks, activeBlockId]
  );

  const updateSchema = (updater: (prev: QuizSchema) => QuizSchema) => {
    setSchema((prev) => updater(prev));
    setDirty(true);
  };

  const addBlock = (defIndex: number) => {
    const def = BLOCK_LIBRARY[defIndex];
    const newBlock: QuizBlock = { id: crypto.randomUUID(), ...def.create() };
    updateSchema((prev) => ({ ...prev, blocks: [...prev.blocks, newBlock] }));
    setActiveBlockId(newBlock.id);
    setMobilePanel('inspector');
  };

  const patchBlock = (patch: Partial<QuizBlock>) => {
    if (!activeBlockId) return;
    updateSchema((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === activeBlockId ? { ...b, ...patch } : b)),
    }));
  };

  const deleteBlock = (blockId?: string) => {
    const target = blockId ?? activeBlockId;
    if (!target) return;
    updateSchema((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== target) }));
    if (target === activeBlockId) setActiveBlockId(null);
  };

  const reorderBlocks = (sourceIndex: number, destinationIndex: number) => {
    if (sourceIndex === destinationIndex) return;
    updateSchema((prev) => {
      const next = Array.from(prev.blocks);
      const [removed] = next.splice(sourceIndex, 1);
      next.splice(destinationIndex, 0, removed);
      return { ...prev, blocks: next };
    });
  };

  const handleDragEnd = (result: DropResult) => {
    const { destination, source } = result;
    if (!destination) return;
    reorderBlocks(source.index, destination.index);
  };

  const handleSave = async () => {
    if (!company?.id || !user?.id) return;
    setSaving(true);
    try {
      await quizService.saveSchema({ quizId: id, companyId: company.id, userId: user.id, schema });
      toast.success('Alterações salvas');
      setDirty(false);
    } catch (e) {
      toast.error('Erro ao salvar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const BlocksPalette = (
    <>
      <div className="p-3 border-b">
        <h3 className="font-bold text-sm mb-2">Blocos</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {BLOCK_LIBRARY.map((def, i) => (
            <button
              key={def.type}
              onClick={() => addBlock(i)}
              className="text-left p-2 rounded-lg border hover:border-primary hover:bg-primary/5 transition-all"
            >
              <def.icon className="h-4 w-4 mb-1 text-primary" />
              <div className="text-xs font-semibold leading-tight">{def.label}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm">Fluxo ({schema.blocks.length})</h3>
          <button
            onClick={() => { setActiveBlockId(null); setMobilePanel(null); }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Palette className="h-3 w-3" /> Design
          </button>
        </div>
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="blocks">
            {(provided) => (
              <div className="space-y-1" ref={provided.innerRef} {...provided.droppableProps}>
                {schema.blocks.map((b, i) => (
                  <Draggable key={b.id} draggableId={b.id} index={i}>
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        onClick={() => { setActiveBlockId(b.id); setMobilePanel('inspector'); }}
                        className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all ${
                          dragSnapshot.isDragging ? 'shadow-lg bg-card ring-2 ring-primary/40' :
                          activeBlockId === b.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'
                        }`}
                      >
                        <div {...dragProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing">
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold truncate">{b.title || b.resultTitle || `Bloco ${i + 1}`}</div>
                          <div className="text-[10px] text-muted-foreground">{b.type}</div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteBlock(b.id); }}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                {schema.blocks.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    <Plus className="h-4 w-4 mx-auto mb-1 opacity-50" />
                    Adicione blocos acima
                  </div>
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
    </>
  );

  return createPortal(
    <div className="fixed inset-0 flex flex-col bg-background z-[60]">
      {/* Topbar */}
      <header className="h-14 border-b flex items-center justify-between gap-2 px-2 sm:px-4 shrink-0">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <Button asChild variant="ghost" size="sm" className="shrink-0 px-2 sm:px-3">
            <Link to="/quizzes">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Voltar</span>
            </Link>
          </Button>
          <div className="border-l pl-2 sm:pl-3 min-w-0">
            <h1 className="font-bold text-sm leading-none truncate max-w-[100px] min-[420px]:max-w-[160px] sm:max-w-[280px]">
              {quiz?.name ?? 'Quiz'}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
              Builder {dirty && <span className="text-amber-500">• não salvo</span>}
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-1 border rounded-lg p-0.5 shrink-0">
          <Button size="sm" variant={device === 'mobile' ? 'secondary' : 'ghost'} onClick={() => setDevice('mobile')}><Smartphone className="h-4 w-4" /></Button>
          <Button size="sm" variant={device === 'tablet' ? 'secondary' : 'ghost'} onClick={() => setDevice('tablet')}><Tablet className="h-4 w-4" /></Button>
          <Button size="sm" variant={device === 'desktop' ? 'secondary' : 'ghost'} onClick={() => setDevice('desktop')}><Monitor className="h-4 w-4" /></Button>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden px-2"
            onClick={() => setMobilePanel('blocks')}
            aria-label="Blocos"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden px-2"
            onClick={() => setMobilePanel('inspector')}
            aria-label="Editar / Design"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAccessRulesOpen(true)} className="gap-2 px-2 sm:px-3">
            <ShieldCheck className="h-4 w-4" /> <span className="hidden sm:inline">Regras de acesso</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: '/quizzes/$id/preview', params: { id } })} className="gap-2 px-2 sm:px-3">
            <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Preview</span>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !dirty} className="gap-2 px-2 sm:px-3 shadow-lg shadow-primary/20">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="hidden sm:inline">Salvar</span>
          </Button>
        </div>
      </header>

      {/* 3-column layout on desktop, single column + drawers on mobile/tablet */}
      <div className="flex-1 flex overflow-hidden">
        <aside className="hidden lg:block w-72 border-r bg-card overflow-y-auto">
          {BlocksPalette}
        </aside>

        <main className="flex-1 overflow-hidden">
          <QuizPreview
            schema={schema}
            activeBlockId={activeBlockId}
            onSelectBlock={(blockId) => { setActiveBlockId(blockId); setMobilePanel('inspector'); }}
            device={device}
          />
        </main>

        <QuizInspector
          quizId={id}
          block={activeBlock}
          design={schema.design}
          onChangeBlock={patchBlock}
          onDeleteBlock={() => deleteBlock()}
          onChangeDesign={(patch) => updateSchema((prev) => ({ ...prev, design: { ...prev.design, ...patch } }))}
          className="hidden lg:block w-80 border-l bg-card overflow-y-auto"
        />
      </div>

      {/* Mobile/tablet drawers */}
      <Sheet open={!isDesktop && mobilePanel === 'blocks'} onOpenChange={(open) => !open && setMobilePanel(null)}>
        <SheetContent side="left" className="w-[88vw] max-w-sm p-0 overflow-y-auto lg:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Blocos do quiz</SheetTitle>
          </SheetHeader>
          {BlocksPalette}
        </SheetContent>
      </Sheet>

      <Sheet open={!isDesktop && mobilePanel === 'inspector'} onOpenChange={(open) => !open && setMobilePanel(null)}>
        <SheetContent side="right" className="w-[88vw] max-w-sm p-0 overflow-y-auto lg:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>{activeBlock ? 'Editar bloco' : 'Design do quiz'}</SheetTitle>
          </SheetHeader>
          <QuizInspector
            quizId={id}
            block={activeBlock}
            design={schema.design}
            onChangeBlock={patchBlock}
            onDeleteBlock={() => deleteBlock()}
            onChangeDesign={(patch) => updateSchema((prev) => ({ ...prev, design: { ...prev.design, ...patch } }))}
            className="w-full"
          />
        </SheetContent>
      </Sheet>

      <AccessRulesDialog quizId={id} open={accessRulesOpen} onOpenChange={setAccessRulesOpen} />
    </div>,
    document.body
  );
}
