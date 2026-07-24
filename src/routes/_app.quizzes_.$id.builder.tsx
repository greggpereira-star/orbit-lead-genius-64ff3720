import { createFileRoute, Link, useParams, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
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
  Settings,
  Users,
  Workflow,
  Rocket,
  ChevronDown,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { quizService } from '@/modules/quiz/services/quizService';
import { QuizPreview } from '@/modules/quiz/components/QuizPreview';
import { QuizInspector } from '@/modules/quiz/components/QuizInspector';
import { AccessRulesDialog } from '@/modules/quiz/components/AccessRulesDialog';
import { QuizSettingsDialog } from '@/modules/quiz/components/QuizSettingsDialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { BLOCK_LIBRARY, BLOCK_CATEGORY_LABELS, type BlockCategory } from '@/modules/quiz/blocks-library';
import { STEP_TEMPLATES } from '@/modules/quiz/step-templates';
import { DEFAULT_DESIGN } from '@/modules/quiz/design-presets';
import { getSteps } from '@/modules/quiz/lib/steps';
import type { QuizBlock, QuizFunnel, QuizSchema, QuizStep } from '@/modules/quiz/types';

const CATEGORY_ORDER: BlockCategory[] = [
  'captura', 'conteudo', 'interacao', 'oferta', 'gamificacao', 'midia', 'prova', 'resultado', 'livre',
];

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
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [accessRulesOpen, setAccessRulesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'blocks' | 'inspector' | null>(null);
  const [isDesktop, setIsDesktop] = useState(true);
  const [autosave, setAutosave] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

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
        setSchema({ ...s, steps: getSteps(s) });
      } catch (e) {
        console.error('Erro ao carregar quiz', e);
        toast.error('Não foi possível carregar este quiz agora. Tente recarregar a página.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const steps = useMemo(() => getSteps(schema), [schema]);

  const activeBlock = useMemo(
    () => schema.blocks.find((b) => b.id === activeBlockId) ?? null,
    [schema.blocks, activeBlockId]
  );

  const updateSchema = (updater: (prev: QuizSchema) => QuizSchema) => {
    setSchema((prev) => updater(prev));
    setDirty(true);
  };

  // Mantém schema.blocks sempre sincronizado com a ordem "achatada" de schema.steps —
  // steps é a fonte de verdade de agrupamento/ordem; blocks guarda o conteúdo de cada bloco.
  // IMPORTANTE: nunca descarta um bloco que exista em prev.blocks mas não esteja em
  // newSteps (isso já causou perda silenciosa do bloco no canvas). Qualquer bloco que
  // sobrar é reanexado como sua própria etapa no final — o dado nunca some.
  const applySteps = (buildSteps: (prev: QuizSchema) => QuizStep[]) => {
    updateSchema((prev) => {
      const rawSteps = buildSteps(prev);
      const existing = new Set(prev.blocks.map((b) => b.id));
      // sanea referências pendentes e etapas vazias
      const cleaned = rawSteps
        .map((s) => ({ ...s, blockIds: s.blockIds.filter((id) => existing.has(id)) }))
        .filter((s) => s.blockIds.length > 0);
      // reanexa qualquer bloco que ficou de fora
      const covered = new Set(cleaned.flatMap((s) => s.blockIds));
      const orphanSteps = prev.blocks
        .filter((b) => !covered.has(b.id))
        .map((b) => ({ id: `step-${b.id}`, blockIds: [b.id] }));
      const finalSteps = [...cleaned, ...orphanSteps];
      const orderedIds = finalSteps.flatMap((s) => s.blockIds);
      const blockMap = new Map(prev.blocks.map((b) => [b.id, b]));
      const newBlocks = orderedIds.map((bid) => blockMap.get(bid)!).filter(Boolean);
      return { ...prev, blocks: newBlocks, steps: finalSteps };
    });
  };

  // Insere uma ETAPA inteira pré-montada (vários blocos agrupados numa tela só).
  const addStepTemplate = (templateId: string) => {
    const template = STEP_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    const newBlocks: QuizBlock[] = template.create().map((b) => ({ id: crypto.randomUUID(), ...b }));
    updateSchema((prev) => ({
      ...prev,
      blocks: [...prev.blocks, ...newBlocks],
      steps: [...(prev.steps ?? []), { id: `step-${newBlocks[0].id}`, blockIds: newBlocks.map((b) => b.id) }],
    }));
    setActiveBlockId(newBlocks[0].id);
    setMobilePanel('inspector');
    toast.success(`Etapa "${template.name}" adicionada`);
  };

  const addBlock = (defIndex: number) => {
    const def = BLOCK_LIBRARY[defIndex];
    const newBlock: QuizBlock = { id: crypto.randomUUID(), ...def.create() };
    updateSchema((prev) => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
      // Usa prev.steps (não a `steps` memoizada do render) — cliques em sucessão rápida
      // no mesmo lote de eventos compartilham o mesmo closure da `steps` desse render, e
      // basear-se nela aqui descartaria silenciosamente as etapas de blocos adicionados
      // entre um render e outro.
      steps: [...(prev.steps ?? []), { id: `step-${newBlock.id}`, blockIds: [newBlock.id] }],
    }));
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
    const index = schema.blocks.findIndex((b) => b.id === target);
    const removed = schema.blocks[index];
    if (!removed) return;
    const ownerStepIndex = steps.findIndex((s) => s.blockIds.includes(target));
    updateSchema((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => b.id !== target),
      steps: (prev.steps ?? [])
        .map((s) => (s.blockIds.includes(target) ? { ...s, blockIds: s.blockIds.filter((bid) => bid !== target) } : s))
        .filter((s) => s.blockIds.length > 0),
    }));
    if (target === activeBlockId) setActiveBlockId(null);
    toast('Bloco excluído', {
      description: removed.title || removed.resultTitle || removed.type,
      action: {
        label: 'Desfazer',
        onClick: () => {
          updateSchema((prev) => {
            const nextBlocks = Array.from(prev.blocks);
            nextBlocks.splice(index, 0, removed);
            const nextSteps = getSteps({ blocks: prev.blocks, steps: prev.steps });
            const restoredSteps = Array.from(nextSteps);
            if (ownerStepIndex >= 0 && ownerStepIndex <= restoredSteps.length) {
              restoredSteps.splice(ownerStepIndex, 0, { id: `step-${removed.id}`, blockIds: [removed.id] });
            } else {
              restoredSteps.push({ id: `step-${removed.id}`, blockIds: [removed.id] });
            }
            return { ...prev, blocks: nextBlocks, steps: restoredSteps };
          });
          setActiveBlockId(removed.id);
        },
      },
    });
  };

  const toggleStepExpanded = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === 'palette') return;

    if (source.droppableId === 'palette') {
      const type = draggableId.replace('palette-', '');
      const defIndex = BLOCK_LIBRARY.findIndex((d) => d.type === type);
      if (defIndex === -1) return;
      const def = BLOCK_LIBRARY[defIndex];
      const newBlock: QuizBlock = { id: crypto.randomUUID(), ...def.create() };

      if (destination.droppableId.startsWith('step-')) {
        // Soltou dentro de uma etapa já expandida — só adiciona o componente a ela,
        // não cria uma etapa nova (pedido explícito: nova etapa só nasce por ação clara).
        const targetStepId = destination.droppableId.slice('step-'.length);
        updateSchema((prev) => {
          const prevSteps = getSteps(prev);
          const nextSteps = prevSteps.map((s) =>
            s.id === targetStepId
              ? { ...s, blockIds: [...s.blockIds.slice(0, destination.index), newBlock.id, ...s.blockIds.slice(destination.index)] }
              : s
          );
          return { ...prev, blocks: [...prev.blocks, newBlock], steps: nextSteps };
        });
      } else {
        // Soltou na lista de etapas (fora de uma expandida) — cria etapa nova.
        updateSchema((prev) => {
          const nextSteps = Array.from(getSteps(prev));
          nextSteps.splice(destination.index, 0, { id: `step-${newBlock.id}`, blockIds: [newBlock.id] });
          return { ...prev, blocks: [...prev.blocks, newBlock], steps: nextSteps };
        });
      }
      setActiveBlockId(newBlock.id);
      setMobilePanel('inspector');
      return;
    }

    if (source.droppableId === 'steps') {
      // Reordena etapas inteiras.
      if (source.index === destination.index) return;
      applySteps((prev) => {
        const nextSteps = Array.from(getSteps(prev));
        const [moved] = nextSteps.splice(source.index, 1);
        if (moved) nextSteps.splice(destination.index, 0, moved);
        return nextSteps;
      });
      return;
    }

    if (source.droppableId.startsWith('step-')) {
      const sourceStepId = source.droppableId.slice('step-'.length);
      const destStepId = destination.droppableId.startsWith('step-') ? destination.droppableId.slice('step-'.length) : null;
      if (!destStepId) return; // não suportado: soltar um componente já existente fora de qualquer etapa

      if (sourceStepId === destStepId) {
        if (source.index === destination.index) return;
        applySteps((prev) =>
          getSteps(prev).map((s) => {
            if (s.id !== sourceStepId) return s;
            const ids = Array.from(s.blockIds);
            const [moved] = ids.splice(source.index, 1);
            if (moved) ids.splice(destination.index, 0, moved);
            return { ...s, blockIds: ids };
          })
        );
        return;
      }

      // Move o componente de uma etapa pra outra; remove a etapa de origem se ficar vazia.
      const movedId = draggableId;
      applySteps((prev) => {
        const withoutMoved = getSteps(prev)
          .map((s) => (s.id === sourceStepId ? { ...s, blockIds: s.blockIds.filter((bid) => bid !== movedId) } : s))
          .filter((s) => s.id === destStepId || s.blockIds.length > 0);
        return withoutMoved.map((s) => {
          if (s.id !== destStepId) return s;
          const ids = Array.from(s.blockIds);
          ids.splice(destination.index, 0, movedId);
          return { ...s, blockIds: ids };
        });
      });
    }
  };

  const handleSave = async (opts?: { silent?: boolean }) => {
    if (!company?.id || !user?.id) return;
    setSaving(true);
    try {
      await quizService.saveSchema({ quizId: id, companyId: company.id, userId: user.id, schema });
      if (!opts?.silent) toast.success('Alterações salvas');
      setDirty(false);
      setSaveError(false);
      setLastSavedAt(new Date());
    } catch (e) {
      console.error('Erro ao salvar quiz', e);
      // Mesmo num autosave silencioso, uma FALHA nunca pode passar despercebida —
      // senão o usuário acha que está tudo salvo e perde trabalho. Marca o estado de
      // erro (o indicador fica vermelho) e avisa uma vez por falha.
      setSaveError(true);
      toast.error('Não foi possível salvar. Suas alterações ainda estão só nesta aba — tente salvar de novo.');
    } finally {
      setSaving(false);
    }
  };

  // Salvamento automático: evita que o Preview e o link público fiquem desatualizados
  // em relação ao que está sendo editado (padrão já validado por concorrentes).
  useEffect(() => {
    if (!autosave || !dirty || loading) return;
    const timer = setTimeout(() => {
      handleSave({ silent: true });
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, dirty, autosave, loading]);

  const handleTogglePublish = async () => {
    if (!quiz) return;
    if (quiz.status === 'published' && !window.confirm('Despublicar este quiz? O link público deixará de funcionar imediatamente.')) {
      return;
    }
    setPublishing(true);
    try {
      if (dirty) await handleSave({ silent: true });
      if (quiz.status === 'published') {
        await quizService.unpublish(id);
        toast.success('Quiz despublicado — o link público deixou de funcionar.');
      } else {
        await quizService.publish(id);
        toast.success('Quiz publicado! O link público já está no ar.');
      }
      const fresh = await quizService.getById(id);
      setQuiz(fresh);
    } catch (e) {
      console.error('Erro ao publicar/despublicar quiz', e);
      toast.error('Não foi possível atualizar a publicação agora.');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const groupedBlocks = (() => {
    let paletteIndex = 0;
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: BLOCK_LIBRARY.map((def, defIndex) => ({ def, defIndex })).filter(
        ({ def }) => def.category === category
      ),
    }))
      .filter((g) => g.items.length > 0)
      .map((g) => ({
        ...g,
        items: g.items.map((item) => ({ ...item, paletteIndex: paletteIndex++ })),
      }));
  })();

  const BlocksPalette = (
    <>
      <div className="p-3 border-b">
        <h3 className="font-bold text-sm mb-2">Modelos prontos</h3>
        <p className="text-[11px] text-muted-foreground mb-3">Insere uma etapa completa, já montada — é só personalizar os textos.</p>
        <div className="space-y-1.5">
          {STEP_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => addStepTemplate(t.id)}
              className="w-full flex items-start gap-2.5 rounded-lg border p-2 text-left transition-all hover:border-primary hover:bg-primary/5"
            >
              <span className="text-base leading-none mt-0.5">{t.emoji}</span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold leading-tight">{t.name}</span>
                <span className="block text-[10px] text-muted-foreground leading-tight mt-0.5">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="p-3 border-b">
        <h3 className="font-bold text-sm mb-2">Blocos</h3>
        <p className="text-[11px] text-muted-foreground mb-3">Arraste até o canvas ou clique para adicionar</p>
        <Droppable droppableId="palette" isDropDisabled>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps}>
              <Accordion type="multiple" defaultValue={CATEGORY_ORDER} className="space-y-1">
                {groupedBlocks.map(({ category, items }) => (
                  <AccordionItem key={category} value={category} className="border-b-0">
                    <AccordionTrigger className="py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:no-underline">
                      {BLOCK_CATEGORY_LABELS[category]}
                    </AccordionTrigger>
                    <AccordionContent className="pb-2 pt-0">
                      <div className="grid grid-cols-2 gap-1.5">
                        {items.map(({ def, defIndex, paletteIndex }) => (
                          <Draggable key={def.type} draggableId={`palette-${def.type}`} index={paletteIndex}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                role="button"
                                tabIndex={0}
                                onClick={() => addBlock(defIndex)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') addBlock(defIndex);
                                }}
                                title={def.description}
                                className={`relative text-left p-2 rounded-lg border hover:border-primary hover:bg-primary/5 transition-all cursor-grab active:cursor-grabbing select-none ${
                                  dragSnapshot.isDragging ? 'shadow-xl ring-2 ring-primary/40 bg-card' : ''
                                }`}
                              >
                                <GripVertical className="absolute right-1 top-1 h-3 w-3 text-muted-foreground opacity-40" />
                                <def.icon className="h-4 w-4 mb-1 text-primary" />
                                <div className="text-xs font-semibold leading-tight pr-3">{def.label}</div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm">Etapas ({steps.length})</h3>
          <button
            onClick={() => { setActiveBlockId(null); setMobilePanel(null); }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Palette className="h-3 w-3" /> Design
          </button>
        </div>
        <Droppable droppableId="steps">
          {(stepsProvided) => (
            <div className="space-y-1.5" ref={stepsProvided.innerRef} {...stepsProvided.droppableProps}>
              {steps.map((step, stepIdx) => {
                const stepBlocks = step.blockIds.map((bid) => schema.blocks.find((b) => b.id === bid)).filter(Boolean) as QuizBlock[];
                const firstBlock = stepBlocks[0];
                const firstDef = firstBlock ? BLOCK_LIBRARY.find((d) => d.type === firstBlock.type) : undefined;
                // Etapa com um único componente não tem nada de novo pra "revelar" ao
                // expandir — o cabeçalho e o item interno mostravam exatamente a mesma
                // coisa duas vezes. Aqui a própria linha da etapa JÁ é o componente: sem
                // seta, com o botão de excluir direto, e o clique seleciona pro Inspetor.
                const soloBlock = stepBlocks.length === 1 ? stepBlocks[0] : null;
                const expanded = !soloBlock && expandedSteps.has(step.id);
                return (
                  <Draggable key={step.id} draggableId={`step-drag-${step.id}`} index={stepIdx}>
                    {(stepDragProvided, stepDragSnapshot) => (
                      <div
                        ref={stepDragProvided.innerRef}
                        {...stepDragProvided.draggableProps}
                        className={`rounded-xl border transition-all ${
                          stepDragSnapshot.isDragging ? 'shadow-lg bg-card ring-2 ring-primary/40' : 'border-transparent'
                        }`}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (soloBlock) { setActiveBlockId(soloBlock.id); setMobilePanel('inspector'); }
                            else toggleStepExpanded(step.id);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            if (soloBlock) { setActiveBlockId(soloBlock.id); setMobilePanel('inspector'); }
                            else toggleStepExpanded(step.id);
                          }}
                          className={`group flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                            soloBlock
                              ? activeBlockId === soloBlock.id
                                ? 'bg-primary/10 border border-primary/30'
                                : 'hover:bg-muted border border-transparent'
                              : expanded
                                ? 'bg-muted'
                                : 'hover:bg-muted border border-transparent'
                          }`}
                        >
                          <div
                            {...stepDragProvided.dragHandleProps}
                            className="shrink-0 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            {firstDef ? <firstDef.icon className="h-3.5 w-3.5 text-primary" /> : <LayoutGrid className="h-3.5 w-3.5 text-primary" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-semibold truncate">
                              Etapa {stepIdx + 1}{firstBlock ? ` · ${firstBlock.title || firstBlock.resultTitle || firstDef?.label || firstBlock.type}` : ''}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {soloBlock ? (firstDef?.label ?? firstBlock?.type) : `${stepBlocks.length} componentes`}
                            </div>
                          </div>
                          {soloBlock ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteBlock(soloBlock.id); }}
                              className="shrink-0 opacity-40 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                              aria-label="Excluir etapa"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          ) : expanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                        </div>
                        {expanded && (
                          <Droppable droppableId={`step-${step.id}`}>
                            {(moduleProvided) => (
                              <div
                                className="space-y-1 pl-6 pr-1 pb-1.5 pt-0.5"
                                ref={moduleProvided.innerRef}
                                {...moduleProvided.droppableProps}
                              >
                                {stepBlocks.map((b, bi) => {
                                  const def = BLOCK_LIBRARY.find((d) => d.type === b.type);
                                  return (
                                    <Draggable key={b.id} draggableId={b.id} index={bi}>
                                      {(dragProvided, dragSnapshot) => (
                                        <div
                                          ref={dragProvided.innerRef}
                                          {...dragProvided.draggableProps}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => { setActiveBlockId(b.id); setMobilePanel('inspector'); }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') { setActiveBlockId(b.id); setMobilePanel('inspector'); }
                                          }}
                                          className={`group flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all ${
                                            dragSnapshot.isDragging ? 'shadow-lg bg-card ring-2 ring-primary/40' :
                                            activeBlockId === b.id ? 'bg-primary/10 border border-primary/30' : 'hover:bg-background border border-transparent'
                                          }`}
                                        >
                                          <div
                                            {...dragProvided.dragHandleProps}
                                            className="shrink-0 cursor-grab active:cursor-grabbing opacity-40 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <GripVertical className="h-3 w-3 text-muted-foreground" />
                                          </div>
                                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
                                            {def ? <def.icon className="h-3 w-3 text-primary" /> : <LayoutGrid className="h-3 w-3 text-primary" />}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className="text-xs font-medium truncate">{b.title || b.resultTitle || def?.label || b.type}</div>
                                            <div className="text-[10px] text-muted-foreground truncate">{def?.label ?? b.type}</div>
                                          </div>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); deleteBlock(b.id); }}
                                            className="shrink-0 opacity-40 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                                            aria-label="Excluir componente"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        </div>
                                      )}
                                    </Draggable>
                                  );
                                })}
                                {moduleProvided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        )}
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {stepsProvided.placeholder}
              {steps.length === 0 && (
                <div className="text-center py-8 px-3 text-xs text-muted-foreground border border-dashed rounded-xl">
                  <LayoutGrid className="h-5 w-5 mx-auto mb-1.5 opacity-40" />
                  Nenhuma etapa ainda.
                  <br />
                  Adicione um bloco acima para começar.
                </div>
              )}
            </div>
          )}
        </Droppable>
      </div>
    </>
  );

  return createPortal(
    <DragDropContext onDragEnd={handleDragEnd}>
    <div className="fixed inset-0 flex flex-col bg-background z-40">
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
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Builder</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-1 border rounded-lg p-0.5 shrink-0">
          <Button size="sm" variant={device === 'mobile' ? 'secondary' : 'ghost'} onClick={() => setDevice('mobile')} aria-label="Visualizar em celular" aria-pressed={device === 'mobile'}><Smartphone className="h-4 w-4" /></Button>
          <Button size="sm" variant={device === 'tablet' ? 'secondary' : 'ghost'} onClick={() => setDevice('tablet')} aria-label="Visualizar em tablet" aria-pressed={device === 'tablet'}><Tablet className="h-4 w-4" /></Button>
          <Button size="sm" variant={device === 'desktop' ? 'secondary' : 'ghost'} onClick={() => setDevice('desktop')} aria-label="Visualizar em desktop" aria-pressed={device === 'desktop'}><Monitor className="h-4 w-4" /></Button>
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
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="gap-2 px-2 sm:px-3">
            <Settings className="h-4 w-4" /> <span className="hidden sm:inline">Configurações</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: '/quizzes/$id/flow', params: { id } })} className="gap-2 px-2 sm:px-3">
            <Workflow className="h-4 w-4" /> <span className="hidden sm:inline">Fluxo</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: '/quizzes/$id/leads', params: { id } })} className="gap-2 px-2 sm:px-3">
            <Users className="h-4 w-4" /> <span className="hidden sm:inline">Leads</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAccessRulesOpen(true)} className="gap-2 px-2 sm:px-3">
            <ShieldCheck className="h-4 w-4" /> <span className="hidden sm:inline">Regras de acesso</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate({ to: '/quizzes/$id/preview', params: { id } })} className="gap-2 px-2 sm:px-3">
            <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Preview</span>
          </Button>
          <div className="hidden lg:flex items-center gap-1.5 border rounded-lg px-2 py-1 shrink-0">
            <Switch id="autosave" checked={autosave} onCheckedChange={setAutosave} className="scale-90" />
            <label htmlFor="autosave" className="text-xs font-medium text-muted-foreground cursor-pointer whitespace-nowrap">
              Salvamento automático
            </label>
          </div>
          {saveError ? (
            <button
              onClick={() => handleSave()}
              className="flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive shrink-0 hover:bg-destructive/20 transition-colors"
              title="Falha ao salvar — clique para tentar de novo"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              <span className="hidden min-[420px]:inline">Erro — tentar de novo</span>
            </button>
          ) : (
            <div
              className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium shrink-0 ${
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
          <Button size="sm" onClick={() => handleSave()} disabled={saving || !dirty} variant="outline" className="gap-2 px-2 sm:px-3">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            <span className="hidden sm:inline">Salvar</span>
          </Button>
          <Button
            size="sm"
            onClick={handleTogglePublish}
            disabled={publishing}
            variant={quiz?.status === 'published' ? 'outline' : 'default'}
            className={`gap-2 px-2 sm:px-3 ${quiz?.status === 'published' ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'shadow-lg shadow-primary/20'}`}
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            <span className="hidden sm:inline">{quiz?.status === 'published' ? 'Publicado' : 'Publicar'}</span>
          </Button>
        </div>
      </header>

      {/* 3-column layout on desktop, single column + drawers on mobile/tablet */}
      <div className="flex-1 flex overflow-hidden">
        <aside className="hidden lg:block w-72 border-r bg-card overflow-y-auto">
          {isDesktop && BlocksPalette}
        </aside>

        <main className="flex-1 overflow-hidden">
          <QuizPreview
            schema={schema}
            activeBlockId={activeBlockId}
            onSelectBlock={(blockId) => { setActiveBlockId(blockId); setMobilePanel('inspector'); }}
            device={device}
            onRequestAddBlock={!isDesktop ? () => setMobilePanel('blocks') : undefined}
          />
        </main>

        <QuizInspector
          quizId={id}
          block={activeBlock}
          blocks={schema.blocks}
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
            blocks={schema.blocks}
            design={schema.design}
            onChangeBlock={patchBlock}
            onDeleteBlock={() => deleteBlock()}
            onChangeDesign={(patch) => updateSchema((prev) => ({ ...prev, design: { ...prev.design, ...patch } }))}
            className="w-full"
          />
        </SheetContent>
      </Sheet>

      <AccessRulesDialog quizId={id} open={accessRulesOpen} onOpenChange={setAccessRulesOpen} />

      {company?.id && (
        <QuizSettingsDialog
          quizId={id}
          companyId={company.id}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          onSaved={setQuiz}
        />
      )}
    </div>
    </DragDropContext>,
    document.body
  );
}
