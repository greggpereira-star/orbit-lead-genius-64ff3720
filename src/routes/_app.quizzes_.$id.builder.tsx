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
  UploadCloud,
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
  'captura', 'conteudo', 'interacao', 'oferta', 'gamificacao', 'midia', 'prova', 'resultado', 'layout', 'livre',
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
  /** Etapa escolhida na barra lateral como destino dos próximos componentes. */
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
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
  /* Rascunho e ar são coisas diferentes: salvar acumula versão, publicar troca
     a que o visitante vê. Guardar os dois ids é o que permite dizer "você tem
     alteração que ainda não está no ar". */
  const [publishedVersionId, setPublishedVersionId] = useState<string | null>(null);
  const [latestVersionId, setLatestVersionId] = useState<string | null>(null);

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
        const [q, s, pub] = await Promise.all([
          quizService.getById(id),
          quizService.getLatestSchema(id),
          quizService.getPublishState(id),
        ]);
        if (!mounted) return;
        setQuiz(q);
        setSchema({ ...s, steps: getSteps(s) });
        setPublishedVersionId(pub.publishedVersionId);
        setLatestVersionId(pub.latestVersionId);
      } catch (e) {
        console.error('Erro ao carregar quiz', e);
        toast.error('Não foi possível carregar este quiz agora. Tente recarregar a página.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  // `keepEmpty`: no builder uma etapa recém-criada vive vazia até ganhar o
  // primeiro componente. Preview e player continuam podando as vazias.
  const steps = useMemo(() => getSteps(schema, { keepEmpty: true }), [schema]);

  /**
   * Etapa onde o próximo bloco vai cair.
   *
   * Era isto que faltava: sem um "onde estou montando", clicar na paleta só
   * podia criar etapa nova — e era exatamente esse o defeito relatado. A etapa
   * escolhida na barra manda; sem escolha, vale a etapa do componente
   * selecionado; sem nada, a primeira.
   *
   * A primeira, e não a última, porque esta mesma etapa é a que o canvas
   * mostra: ao abrir o builder você vê a tela de abertura do quiz, e o bloco
   * cai onde você está olhando. Um destino diferente do que está na tela seria
   * a mesma classe de confusão que este trabalho veio corrigir.
   */
  const targetStep = useMemo(() => {
    const byPick = activeStepId ? steps.find((s) => s.id === activeStepId) : undefined;
    if (byPick) return byPick;
    const byBlock = activeBlockId ? steps.find((s) => s.blockIds.includes(activeBlockId)) : undefined;
    if (byBlock) return byBlock;
    return steps[0] ?? null;
  }, [steps, activeStepId, activeBlockId]);

  const targetStepIndex = targetStep ? steps.findIndex((s) => s.id === targetStep.id) : -1;

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
      // Etapa vazia sobrevive no builder de propósito: ela é uma tela que o
      // usuário criou e ainda não preencheu. Quem poda é o preview/player.
      const cleaned = rawSteps.map((s) => ({
        ...s,
        blockIds: s.blockIds.filter((id) => existing.has(id)),
      }));
      // reanexa qualquer bloco que ficou de fora — mas um bloco "filho" de algum
      // Container (childBlockIds) também conta como coberto: ele nunca aparece no
      // blockIds de uma etapa, só na lista do Container que o contém.
      const containerChildIds = prev.blocks.flatMap((b) => b.childBlockIds ?? []);
      const covered = new Set([...cleaned.flatMap((s) => s.blockIds), ...containerChildIds]);
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

  /**
   * Cria uma etapa vazia e passa a montá-la.
   *
   * Etapa nova só nasce por ação explícita. Antes ela nascia sozinha a cada
   * bloco adicionado, e por isso nenhuma etapa passava de um componente.
   */
  const addStep = () => {
    const newStep: QuizStep = { id: `step-${crypto.randomUUID()}`, blockIds: [] };
    updateSchema((prev) => ({
      ...prev,
      steps: [...getSteps(prev, { keepEmpty: true }), newStep],
    }));
    setActiveStepId(newStep.id);
    setActiveBlockId(null);
    setExpandedSteps((prev) => new Set(prev).add(newStep.id));
    toast.success('Etapa criada — agora escolha os componentes dela');
  };

  const addBlock = (defIndex: number) => {
    const def = BLOCK_LIBRARY[defIndex];
    const newBlock: QuizBlock = { id: crypto.randomUUID(), ...def.create() };
    // Guarda só o ID da etapa alvo, não o objeto: cliques em sucessão rápida no
    // mesmo lote de eventos compartilham este closure, e o ID continua válido
    // enquanto o objeto memoizado já estaria velho.
    const targetId = targetStep?.id ?? null;
    const anchorId = activeBlockId;

    updateSchema((prev) => {
      const prevSteps = getSteps(prev, { keepEmpty: true });
      const target = targetId ? prevSteps.find((s) => s.id === targetId) : undefined;

      // Sem etapa alvo (quiz vazio, ou a etapa sumiu) o bloco inaugura a primeira.
      if (!target) {
        return {
          ...prev,
          blocks: [...prev.blocks, newBlock],
          steps: [...prevSteps, { id: `step-${newBlock.id}`, blockIds: [newBlock.id] }],
        };
      }

      const nextSteps = prevSteps.map((s) => {
        if (s.id !== target.id) return s;
        // Entra logo abaixo do componente selecionado, quando ele é desta etapa —
        // é onde a pessoa está olhando. Senão, no fim da etapa.
        const at = anchorId ? s.blockIds.indexOf(anchorId) : -1;
        const ids = Array.from(s.blockIds);
        ids.splice(at >= 0 ? at + 1 : ids.length, 0, newBlock.id);
        return { ...s, blockIds: ids };
      });
      return { ...prev, blocks: [...prev.blocks, newBlock], steps: nextSteps };
    });

    setActiveBlockId(newBlock.id);
    if (targetId) {
      setActiveStepId(targetId);
      setExpandedSteps((prev) => new Set(prev).add(targetId));
    }
    setMobilePanel('inspector');
  };

  /** Exclui a etapa inteira: a tela e todos os componentes dela. */
  const deleteStep = (stepId: string) => {
    const step = steps.find((s) => s.id === stepId);
    if (!step) return;
    const childIds = step.blockIds.flatMap(
      (bid) => schema.blocks.find((b) => b.id === bid)?.childBlockIds ?? [],
    );
    const idsToRemove = new Set([...step.blockIds, ...childIds]);
    updateSchema((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((b) => !idsToRemove.has(b.id)),
      steps: getSteps(prev, { keepEmpty: true }).filter((s) => s.id !== stepId),
    }));
    if (activeBlockId && idsToRemove.has(activeBlockId)) setActiveBlockId(null);
    if (activeStepId === stepId) setActiveStepId(null);
    toast(`Etapa excluída`, {
      description: idsToRemove.size === 1 ? '1 componente removido' : `${idsToRemove.size} componentes removidos`,
    });
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
    // Excluir um Container leva seus filhos junto (como excluir uma pasta) — o
    // Desfazer restaura os dois, já que `removed.childBlockIds` continua intacto.
    const cascadeIds = removed.type === 'container' ? (removed.childBlockIds ?? []) : [];
    const removedCascade = cascadeIds
      .map((id) => schema.blocks.find((b) => b.id === id))
      .filter((b): b is QuizBlock => !!b);
    const idsToRemove = new Set([target, ...cascadeIds]);
    updateSchema((prev) => ({
      ...prev,
      blocks: prev.blocks
        .filter((b) => !idsToRemove.has(b.id))
        // se o bloco excluído era filho de outro Container, tira a referência de lá também
        .map((b) => (b.childBlockIds?.includes(target) ? { ...b, childBlockIds: b.childBlockIds.filter((id) => id !== target) } : b)),
      // A etapa fica, mesmo esvaziada: apagar um componente é apagar um
      // componente. Quem apaga a tela é o botão de excluir etapa.
      steps: getSteps(prev, { keepEmpty: true }).map((s) =>
        s.blockIds.includes(target) ? { ...s, blockIds: s.blockIds.filter((bid) => bid !== target) } : s,
      ),
    }));
    if (target === activeBlockId) setActiveBlockId(null);
    toast(cascadeIds.length > 0 ? `Container e ${cascadeIds.length} componente(s) excluídos` : 'Bloco excluído', {
      description: removed.title || removed.resultTitle || removed.type,
      action: {
        label: 'Desfazer',
        onClick: () => {
          updateSchema((prev) => {
            const nextBlocks = Array.from(prev.blocks);
            nextBlocks.splice(index, 0, removed, ...removedCascade);
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

  // Move um bloco existente (de qualquer etapa) pra dentro de um Container — tira
  // do blockIds da etapa de origem e acrescenta ao childBlockIds do Container.
  const moveBlockIntoContainer = (blockId: string, containerId: string) => {
    updateSchema((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) =>
        b.id === containerId ? { ...b, childBlockIds: [...(b.childBlockIds ?? []), blockId] } : b
      ),
      steps: getSteps(prev, { keepEmpty: true }).map((s) =>
        s.blockIds.includes(blockId) ? { ...s, blockIds: s.blockIds.filter((id) => id !== blockId) } : s,
      ),
    }));
  };

  // Tira um bloco de dentro de um Container e devolve pra ele sua própria etapa,
  // logo depois da etapa do Container (sem excluir o bloco).
  const removeChildFromContainer = (blockId: string, containerId: string) => {
    const containerStepIndex = steps.findIndex((s) => s.blockIds.includes(containerId));
    updateSchema((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) =>
        b.id === containerId ? { ...b, childBlockIds: (b.childBlockIds ?? []).filter((id) => id !== blockId) } : b
      ),
      steps: [
        ...(prev.steps ?? []).slice(0, containerStepIndex + 1),
        { id: `step-${blockId}`, blockIds: [blockId] },
        ...(prev.steps ?? []).slice(containerStepIndex + 1),
      ],
    }));
  };

  const reorderContainerChildren = (containerId: string, fromIndex: number, toIndex: number) => {
    updateSchema((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => {
        if (b.id !== containerId) return b;
        const next = Array.from(b.childBlockIds ?? []);
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return { ...b, childBlockIds: next };
      }),
    }));
  };

  // Cria um bloco novo já direto como filho de um Container (não vira etapa própria).
  const addChildToContainer = (containerId: string, defIndex: number) => {
    const def = BLOCK_LIBRARY[defIndex];
    const newBlock: QuizBlock = { id: crypto.randomUUID(), ...def.create() };
    updateSchema((prev) => ({
      ...prev,
      blocks: [
        ...prev.blocks.map((b) =>
          b.id === containerId ? { ...b, childBlockIds: [...(b.childBlockIds ?? []), newBlock.id] } : b
        ),
        newBlock,
      ],
    }));
  };

  const toggleStepExpanded = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const handleDragEnd = (rawResult: DropResult) => {
    /* O canvas usa `canvas-step-<id>` e o painel usa `step-<id>` pra MESMA
       etapa. Normalizar aqui faz soltar no canvas e soltar no painel caírem
       nas mesmas regras — antes o canvas não batia com nenhum ramo e arrastar
       lá dentro simplesmente não fazia nada. */
    const unprefix = (dropId: string) => (dropId.startsWith('canvas-step-') ? dropId.slice('canvas-'.length) : dropId);
    const result: DropResult = {
      ...rawResult,
      source: { ...rawResult.source, droppableId: unprefix(rawResult.source.droppableId) },
      destination: rawResult.destination
        ? { ...rawResult.destination, droppableId: unprefix(rawResult.destination.droppableId) }
        : rawResult.destination,
    };
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
          const prevSteps = getSteps(prev, { keepEmpty: true });
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
          const nextSteps = Array.from(getSteps(prev, { keepEmpty: true }));
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
        const nextSteps = Array.from(getSteps(prev, { keepEmpty: true }));
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
          getSteps(prev, { keepEmpty: true }).map((s) => {
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
        // A etapa de origem fica mesmo se esvaziar: tirar o último componente
        // dela não é o mesmo que dizer "quero apagar esta tela".
        const withoutMoved = getSteps(prev, { keepEmpty: true }).map((s) =>
          s.id === sourceStepId ? { ...s, blockIds: s.blockIds.filter((bid) => bid !== movedId) } : s,
        );
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
      const versionId = await quizService.saveSchema({
        quizId: id, companyId: company.id, userId: user.id, schema,
      });
      setLatestVersionId(versionId);
      if (!opts?.silent) {
        toast.success(
          quiz?.status === 'published'
            ? 'Rascunho salvo — publique para o link público mudar'
            : 'Alterações salvas',
        );
      }
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

  /* Só um quiz publicado pode ter "alteração fora do ar": num rascunho, tudo
     ainda está por publicar e o aviso não significaria nada. `dirty` entra
     porque edição não salva também é mudança que o visitante não vê. */
  const hasUnpublishedChanges =
    quiz?.status === 'published' &&
    (dirty || (!!latestVersionId && latestVersionId !== publishedVersionId));

  /** Leva o rascunho atual para o ar, sem mexer no status do quiz. */
  const handlePublishChanges = async () => {
    if (!quiz) return;
    setPublishing(true);
    try {
      if (dirty) await handleSave({ silent: true });
      await quizService.publish(id);
      const pub = await quizService.getPublishState(id);
      setPublishedVersionId(pub.publishedVersionId);
      setLatestVersionId(pub.latestVersionId);
      toast.success('Alterações publicadas — o link público já mostra a versão nova.');
    } catch (e) {
      console.error('Erro ao publicar alterações', e);
      toast.error('Não foi possível publicar agora. Seu rascunho está salvo.');
    } finally {
      setPublishing(false);
    }
  };

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
      const [fresh, pub] = await Promise.all([
        quizService.getById(id),
        quizService.getPublishState(id),
      ]);
      setQuiz(fresh);
      setPublishedVersionId(pub.publishedVersionId);
      setLatestVersionId(pub.latestVersionId);
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
        {/* Dizer ONDE o bloco vai cair é metade do conserto: antes cada clique
            criava uma etapa nova e não havia como saber (nem escolher) o
            destino. Clicar aqui leva à etapa alvo na lista abaixo. */}
        {targetStep ? (
          <button
            type="button"
            onClick={() => {
              setActiveStepId(targetStep.id);
              setExpandedSteps((prev) => new Set(prev).add(targetStep.id));
            }}
            className="mb-3 flex w-full items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-primary/10"
          >
            <LayoutGrid className="h-3 w-3 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">
              Adicionando na <strong className="font-semibold">Etapa {targetStepIndex + 1}</strong>
              {targetStep.blockIds.length > 0 && ` · ${targetStep.blockIds.length} componente${targetStep.blockIds.length > 1 ? 's' : ''}`}
            </span>
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground mb-3">
            O primeiro bloco cria a Etapa 1. Depois, cada bloco entra na etapa selecionada.
          </p>
        )}
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
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-sm">Etapas ({steps.length})</h3>
          <button
            onClick={() => { setActiveBlockId(null); setMobilePanel(null); }}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Palette className="h-3 w-3" /> Design
          </button>
        </div>
        <p className="mb-2 text-[11px] text-muted-foreground">
          Cada etapa é uma tela do quiz e cabe quantos componentes você quiser.
        </p>
        <Button variant="outline" size="sm" className="mb-2.5 w-full" onClick={addStep}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nova etapa
        </Button>
        <Droppable droppableId="steps">
          {(stepsProvided) => (
            <div className="space-y-1.5" ref={stepsProvided.innerRef} {...stepsProvided.droppableProps}>
              {steps.map((step, stepIdx) => {
                const stepBlocks = step.blockIds.map((bid) => schema.blocks.find((b) => b.id === bid)).filter(Boolean) as QuizBlock[];
                const firstBlock = stepBlocks[0];
                const firstDef = firstBlock ? BLOCK_LIBRARY.find((d) => d.type === firstBlock.type) : undefined;
                // TODA etapa expande — inclusive a de um componente só.
                //
                // Antes, etapa com 1 bloco virava "solo": sem seta, sem área de
                // solta. Como todo bloco novo nascia na própria etapa, nenhuma
                // etapa jamais chegava a dois componentes: ela nascia solo e
                // solo não recebia nada. Era o beco sem saída que fazia parecer
                // que "cada bloco vira uma etapa".
                const expanded = expandedSteps.has(step.id);
                const isTarget = step.id === targetStep?.id;
                return (
                  <Draggable key={step.id} draggableId={`step-drag-${step.id}`} index={stepIdx}>
                    {(stepDragProvided, stepDragSnapshot) => (
                      <div
                        ref={stepDragProvided.innerRef}
                        {...stepDragProvided.draggableProps}
                        className={`rounded-xl border transition-all ${
                          stepDragSnapshot.isDragging
                            ? 'shadow-lg bg-card ring-2 ring-primary/40'
                            : isTarget ? 'border-primary/30 bg-primary/[0.03]' : 'border-transparent'
                        }`}
                      >
                        <div
                          role="button"
                          tabIndex={0}
                          /* Clicar na etapa a torna o destino dos próximos
                             componentes — é assim que se escolhe onde montar. */
                          onClick={() => { setActiveStepId(step.id); toggleStepExpanded(step.id); }}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return;
                            setActiveStepId(step.id);
                            toggleStepExpanded(step.id);
                          }}
                          className={`group flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                            expanded ? 'bg-muted' : 'hover:bg-muted border border-transparent'
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
                              {step.name || `Etapa ${stepIdx + 1}`}
                              {firstBlock ? ` · ${firstBlock.title || firstBlock.resultTitle || firstDef?.label || firstBlock.type}` : ''}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              {stepBlocks.length === 0
                                ? 'Vazia — escolha um bloco na paleta'
                                : `${stepBlocks.length} componente${stepBlocks.length > 1 ? 's' : ''}`}
                            </div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteStep(step.id); }}
                            className="shrink-0 opacity-40 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                            aria-label={`Excluir ${step.name || `Etapa ${stepIdx + 1}`} e seus componentes`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          {expanded ? (
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
                                {stepBlocks.length === 0 && (
                                  <p className="rounded-lg border border-dashed px-2 py-4 text-center text-[10px] text-muted-foreground">
                                    {isTarget
                                      ? 'Clique num bloco da paleta — ele entra aqui.'
                                      : 'Etapa vazia. Selecione-a para adicionar componentes.'}
                                  </p>
                                )}
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
              {/* "Salvo" sozinho virou meia verdade num quiz publicado: o
                  rascunho está salvo, mas o visitante continua vendo a versão
                  antiga. O indicador precisa dizer as duas coisas. */}
              <span className="hidden min-[420px]:inline">
                {saving
                  ? 'Salvando…'
                  : dirty
                    ? 'Não salvo'
                    : hasUnpublishedChanges
                      ? 'Salvo — fora do ar'
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
          {/* Publicar alterações só aparece quando há o que publicar. Enquanto
              o rascunho é igual ao que está no ar, este botão seria ruído — e
              pior, sugeriria que algo está pendente quando não está. */}
          {hasUnpublishedChanges && (
            <Button
              size="sm"
              onClick={handlePublishChanges}
              disabled={publishing || saving}
              className="gap-2 px-2 shadow-lg shadow-primary/20 sm:px-3"
            >
              {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              <span className="hidden sm:inline">Publicar alterações</span>
            </Button>
          )}
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
            /* Canvas e painel olham pra mesma etapa: selecionar um bloco na
               lista traz o canvas junto, e navegar no canvas muda o destino
               dos próximos componentes. */
            currentStepId={targetStep?.id ?? null}
            onChangeStep={(stepId) => {
              setActiveStepId(stepId);
              setActiveBlockId(null);
              setExpandedSteps((prev) => new Set(prev).add(stepId));
            }}
          />
        </main>

        <QuizInspector
          quizId={id}
          block={activeBlock}
          blocks={schema.blocks}
          steps={steps}
          design={schema.design}
          onChangeBlock={patchBlock}
          onDeleteBlock={() => deleteBlock()}
          onChangeDesign={(patch) => updateSchema((prev) => ({ ...prev, design: { ...prev.design, ...patch } }))}
          onMoveBlockIntoContainer={moveBlockIntoContainer}
          onRemoveChildFromContainer={removeChildFromContainer}
          onReorderContainerChildren={reorderContainerChildren}
          onAddChildToContainer={addChildToContainer}
          onDeleteChildBlock={deleteBlock}
          onSelectBlock={(blockId) => setActiveBlockId(blockId)}
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
            steps={steps}
            design={schema.design}
            onChangeBlock={patchBlock}
            onDeleteBlock={() => deleteBlock()}
            onChangeDesign={(patch) => updateSchema((prev) => ({ ...prev, design: { ...prev.design, ...patch } }))}
            onMoveBlockIntoContainer={moveBlockIntoContainer}
            onRemoveChildFromContainer={removeChildFromContainer}
            onReorderContainerChildren={reorderContainerChildren}
            onAddChildToContainer={addChildToContainer}
            onDeleteChildBlock={deleteBlock}
            onSelectBlock={(blockId) => setActiveBlockId(blockId)}
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
