import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Position,
  Handle,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LayoutGrid, Eye, ArrowDownWideNarrow, X, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BLOCK_LIBRARY } from '../blocks-library';
import { getSteps, findStepIndexForBlock } from '../lib/steps';
import type { QuizBlock, QuizSchema, QuizStep } from '../types';

const STEP_WIDTH = 260;
const STEP_GAP_X = 340;
const LANE_GAP_Y = 340;

const typeMeta = new Map(BLOCK_LIBRARY.map((def) => [def.type, def]));

// ============ Mini-preview por tipo de bloco (miniatura fiel ao conteúdo real) ============

function MiniPreview({ block }: { block: QuizBlock }) {
  switch (block.type) {
    case 'intro':
      return (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold leading-snug line-clamp-2">{block.title || 'Tela inicial'}</p>
          {block.ctaLabel && (
            <span className="inline-block rounded bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">
              {block.ctaLabel}
            </span>
          )}
        </div>
      );
    case 'single-choice':
    case 'multi-choice':
      return (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold leading-snug line-clamp-2 mb-1">{block.title || 'Pergunta'}</p>
          {(block.options ?? []).slice(0, 3).map((o) => (
            <div key={o.id} className="rounded border bg-muted/50 px-1.5 py-1 text-[9.5px] truncate flex items-center gap-1">
              {o.emoji && <span>{o.emoji}</span>}
              <span className="truncate">{o.label}</span>
              {o.jumpToBlockId && <Eye className="h-2.5 w-2.5 ml-auto shrink-0 text-amber-500" />}
            </div>
          ))}
          {(block.options?.length ?? 0) > 3 && (
            <p className="text-[9px] text-muted-foreground">+{(block.options?.length ?? 0) - 3} opções</p>
          )}
        </div>
      );
    case 'form':
      return (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold leading-snug line-clamp-1">{block.title || 'Formulário'}</p>
          <div className="flex flex-wrap gap-1">
            {block.formFields?.name !== false && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px]">Nome</span>}
            {block.formFields?.email !== false && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px]">E-mail</span>}
            {block.formFields?.phone !== false && <span className="rounded bg-muted px-1.5 py-0.5 text-[9px]">Telefone</span>}
          </div>
        </div>
      );
    case 'pricing':
      return (
        <div className="space-y-0.5">
          <p className="text-[10.5px] font-semibold leading-snug line-clamp-1">{block.title || 'Oferta'}</p>
          <p className="text-sm font-bold text-primary leading-none">{block.pricingPrice || 'R$ 0'}</p>
          {block.pricingOriginalPrice && (
            <p className="text-[9px] text-muted-foreground line-through">{block.pricingOriginalPrice}</p>
          )}
        </div>
      );
    case 'testimonial':
      return (
        <div className="space-y-1">
          <p className="text-[10px] italic leading-snug line-clamp-2">“{block.title || 'Depoimento'}”</p>
          {block.testimonialAuthor && <p className="text-[9px] font-semibold text-muted-foreground">— {block.testimonialAuthor}</p>}
        </div>
      );
    case 'result':
      return (
        <div className="space-y-1">
          <span className="inline-block rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold text-primary">Resultado</span>
          <p className="text-[11px] font-semibold leading-snug line-clamp-2">{block.resultTitle || 'Seu resultado'}</p>
        </div>
      );
    case 'weight':
    case 'height':
      return (
        <div className="flex items-center justify-between rounded border bg-muted/50 px-2 py-1.5">
          <span className="text-[10.5px] font-medium truncate">{block.title || (block.type === 'weight' ? 'Peso' : 'Altura')}</span>
          <span className="text-[9px] text-muted-foreground shrink-0">{block.type === 'weight' ? 'kg' : 'cm'}</span>
        </div>
      );
    case 'short-text':
    case 'long-text':
    case 'email':
    case 'phone':
      return (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold leading-snug line-clamp-2">{block.title || 'Campo de resposta'}</p>
          <div className="h-4 rounded border bg-muted/40" />
        </div>
      );
    case 'countdown':
      return (
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[9px] font-bold text-red-500 tabular-nums">00:{String(block.countdownMinutes ?? 15).padStart(2, '0')}</span>
          <p className="text-[10.5px] font-medium leading-snug line-clamp-1">{block.title || 'Contagem regressiva'}</p>
        </div>
      );
    case 'faq':
      return (
        <div className="space-y-1">
          {(block.faqItems ?? []).slice(0, 2).map((f) => (
            <p key={f.id} className="text-[9.5px] truncate">
              <span className="font-semibold">?</span> {f.question}
            </p>
          ))}
          {(block.faqItems?.length ?? 0) === 0 && <p className="text-[10px] text-muted-foreground">Perguntas frequentes</p>}
        </div>
      );
    case 'argument':
    case 'argument-progress':
    case 'level':
      return (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold leading-snug line-clamp-2">{block.title || 'Argumento'}</p>
          {typeof block.progressValue === 'number' && (
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${block.progressValue}%` }} />
            </div>
          )}
        </div>
      );
    case 'notification':
    case 'ios-notification':
      return (
        <div className="rounded border bg-muted/50 px-2 py-1.5">
          <p className="text-[9px] font-semibold text-muted-foreground">{block.notificationApp || 'Notificação'}</p>
          <p className="text-[10px] truncate">{block.title || 'Alerta'}</p>
        </div>
      );
    case 'image':
    case 'before-after':
      return (
        <div className="flex items-center gap-1.5">
          <div className="h-8 w-10 rounded bg-muted shrink-0" />
          <p className="text-[10.5px] font-medium leading-snug line-clamp-2">{block.title || 'Imagem'}</p>
        </div>
      );
    case 'video':
      return (
        <div className="flex items-center gap-1.5">
          <div className="h-8 w-10 rounded bg-black/80 shrink-0 flex items-center justify-center text-white text-[9px]">▶</div>
          <p className="text-[10.5px] font-medium leading-snug line-clamp-2">{block.title || 'Vídeo'}</p>
        </div>
      );
    case 'comparison':
      return (
        <div className="grid grid-cols-2 gap-1">
          <div className="rounded bg-muted/50 px-1 py-1 text-[9px] truncate">{block.comparisonLeftLabel || 'Antes'}</div>
          <div className="rounded bg-primary/10 px-1 py-1 text-[9px] truncate text-primary">{block.comparisonRightLabel || 'Depois'}</div>
        </div>
      );
    case 'cta':
      return (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold leading-snug line-clamp-2">{block.title || 'Chamada para ação'}</p>
          <span className="inline-block rounded bg-primary px-2 py-0.5 text-[9px] font-semibold text-primary-foreground">
            {block.ctaLabel || 'Continuar'}
          </span>
        </div>
      );
    case 'divider':
      return <div className="h-px w-full bg-border" />;
    default:
      return <p className="text-[11px] font-medium leading-snug line-clamp-2">{block.title || block.resultTitle || 'Conteúdo'}</p>;
  }
}

// ============ Nó de Etapa (agrupa todos os blocos daquela etapa) ============

interface StepNodeData {
  step: QuizStep;
  blocks: QuizBlock[];
  index: number;
  onSelectStep?: (stepId: string) => void;
  [key: string]: unknown;
}

function StepNode({ data }: { data: StepNodeData }) {
  const { step, blocks, index, onSelectStep } = data;
  const dominant = blocks[blocks.length - 1] ?? blocks[0];
  const def = dominant ? typeMeta.get(dominant.type) : undefined;
  const hasConditional = blocks.some((b) => b.showIf?.enabled);

  return (
    <div
      className="rounded-xl border bg-card shadow-md overflow-hidden transition-shadow hover:shadow-lg cursor-pointer"
      style={{ width: STEP_WIDTH }}
      onClick={() => onSelectStep?.(step.id)}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary !w-2.5 !h-2.5 !border-2 !border-background" />
      <Handle
        type="target"
        id="branch-target"
        position={Position.Top}
        className="!bg-amber-500 !w-2.5 !h-2.5 !border-2 !border-background"
      />

      <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-gradient-to-r from-primary/5 to-transparent">
        <span className="flex items-center justify-center h-5 w-5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold shrink-0">
          {index + 1}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground truncate">
          Etapa {index + 1}
        </span>
        {hasConditional && (
          <span
            className="ml-auto flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-500 shrink-0"
            title="Contém bloco com exibição condicional"
          >
            <Eye className="h-2.5 w-2.5" />
          </span>
        )}
      </div>

      <div className="divide-y">
        {blocks.map((b) => {
          const bDef = typeMeta.get(b.type);
          const Icon = bDef?.icon;
          return (
            <div key={b.id} className="px-3 py-2 flex gap-2 items-start">
              {Icon && (
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted mt-0.5">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <MiniPreview block={b} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-3 py-1.5 border-t bg-muted/30 flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground truncate">{def?.label ?? dominant?.type}</span>
        <span className="text-[9px] text-muted-foreground">{blocks.length} {blocks.length === 1 ? 'módulo' : 'módulos'}</span>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-primary !w-2.5 !h-2.5 !border-2 !border-background" />
      <Handle
        type="source"
        id="branch-source"
        position={Position.Bottom}
        className="!bg-amber-500 !w-2.5 !h-2.5 !border-2 !border-background"
      />
    </div>
  );
}

const nodeTypes = { step: StepNode };

// ============ Layout: fluxo principal em linha; alvos de ramificação fora de ordem ganham raia própria ============

function computeLayout(steps: QuizStep[], edges: { source: string; target: string; branch: boolean }[]) {
  const indexOf = new Map(steps.map((s, i) => [s.id, i]));
  // uma etapa "sai da linha principal" quando é alcançada só por salto (branch)
  // vindo de uma etapa que não é a sua predecessora direta na ordem sequencial.
  const reachedOnlyByBranch = new Set<string>();
  const reachedSequentially = new Set<string>();
  for (const e of edges) {
    const sIdx = indexOf.get(e.source);
    const tIdx = indexOf.get(e.target);
    if (sIdx === undefined || tIdx === undefined) continue;
    if (!e.branch && tIdx === sIdx + 1) reachedSequentially.add(e.target);
    if (e.branch && tIdx !== sIdx + 1) reachedOnlyByBranch.add(e.target);
  }
  const positions = new Map<string, { x: number; y: number; lane: number }>();
  let secondaryLaneCount = 0;
  steps.forEach((s, i) => {
    const isSecondary = reachedOnlyByBranch.has(s.id) && !reachedSequentially.has(s.id) && i > 0;
    const lane = isSecondary ? 1 + (secondaryLaneCount % 2) : 0;
    if (isSecondary) secondaryLaneCount += 1;
    positions.set(s.id, { x: i * STEP_GAP_X, y: lane * LANE_GAP_Y, lane });
  });
  return positions;
}

function buildGraph(schema: QuizSchema, onSelectStep?: (stepId: string) => void) {
  const steps = getSteps(schema);
  const blocksById = new Map(schema.blocks.map((b) => [b.id, b]));

  const rawEdges: { source: string; target: string; label?: string; branch: boolean }[] = [];
  const addedKeys = new Set<string>();
  const pushEdge = (sourceStepId: string, targetStepId: string, label: string | undefined, branch: boolean) => {
    if (sourceStepId === targetStepId) return;
    const key = `${sourceStepId}->${targetStepId}::${label ?? ''}`;
    if (addedKeys.has(key)) return;
    addedKeys.add(key);
    rawEdges.push({ source: sourceStepId, target: targetStepId, label, branch });
  };

  steps.forEach((s, i) => {
    const next = steps[i + 1];
    if (next) pushEdge(s.id, next.id, undefined, false);

    for (const blockId of s.blockIds) {
      const b = blocksById.get(blockId);
      if (!b) continue;
      for (const opt of b.options ?? []) {
        if (!opt.jumpToBlockId) continue;
        const targetIdx = findStepIndexForBlock(steps, opt.jumpToBlockId);
        if (targetIdx >= 0) pushEdge(s.id, steps[targetIdx].id, opt.label, true);
      }
      for (const rule of b.logicRules ?? []) {
        const targetIdx = findStepIndexForBlock(steps, rule.jumpToBlockId);
        if (targetIdx >= 0) pushEdge(s.id, steps[targetIdx].id, 'condição', true);
      }
    }
  });

  const positions = computeLayout(steps, rawEdges);

  const nodes: Node[] = steps.map((s, i) => {
    const pos = positions.get(s.id) ?? { x: i * STEP_GAP_X, y: 0 };
    const stepBlocks = s.blockIds.map((id) => blocksById.get(id)).filter(Boolean) as QuizBlock[];
    return {
      id: s.id,
      type: 'step',
      position: { x: pos.x, y: pos.y },
      data: { step: s, blocks: stepBlocks, index: i, onSelectStep },
      draggable: true,
    };
  });

  const edges: Edge[] = rawEdges.map((e) => ({
    id: `${e.source}->${e.target}::${e.label ?? ''}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.branch ? 'branch-source' : undefined,
    targetHandle: e.branch ? 'branch-target' : undefined,
    label: e.label,
    animated: e.branch,
    style: e.branch
      ? { stroke: 'hsl(38 92% 50%)', strokeWidth: 1.75, strokeDasharray: '5 4' }
      : { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
    labelStyle: { fontSize: 10, fill: 'hsl(38 92% 40%)', fontWeight: 700 },
    labelBgStyle: { fillOpacity: 0.95, fill: 'hsl(var(--card))' },
    labelBgPadding: [5, 3] as [number, number],
    labelBgBorderRadius: 6,
    type: 'smoothstep',
    zIndex: e.branch ? 0 : 1,
  }));

  return { nodes, edges };
}

function FlowCanvas({ schema }: { schema: QuizSchema }) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const { nodes: initialNodes, edges } = useMemo(
    () => buildGraph(schema, (stepId) => setSelectedStepId(stepId)),
    [schema]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const { fitView } = useReactFlow();

  const handleReorganize = useCallback(() => {
    setNodes(initialNodes);
    window.requestAnimationFrame(() => fitView({ padding: 0.2, duration: 400 }));
  }, [initialNodes, setNodes, fitView]);

  const steps = useMemo(() => getSteps(schema), [schema]);
  const blocksById = useMemo(() => new Map(schema.blocks.map((b) => [b.id, b])), [schema]);
  const selectedStep = selectedStepId ? steps.find((s) => s.id === selectedStepId) : null;
  const selectedBlocks = selectedStep ? (selectedStep.blockIds.map((id) => blocksById.get(id)).filter(Boolean) as QuizBlock[]) : [];

  if (initialNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-2">
        <LayoutGrid className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Adicione etapas ao quiz no Builder para ver o fluxograma.</p>
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.15}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-40" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-card !border !rounded-lg" nodeColor="hsl(var(--primary) / 0.35)" />
      </ReactFlow>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
        <Button onClick={handleReorganize} size="sm" className="gap-2 shadow-lg rounded-full px-4">
          <ArrowDownWideNarrow className="h-3.5 w-3.5" />
          Organizar layout
        </Button>
      </div>

      {selectedStep && (
        <div className="absolute top-4 right-4 z-10 w-72 rounded-xl border bg-card shadow-xl">
          <div className="flex items-center justify-between px-3.5 py-2.5 border-b">
            <p className="text-xs font-bold">Etapa {steps.indexOf(selectedStep) + 1}</p>
            <button onClick={() => setSelectedStepId(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="p-3.5 space-y-2.5 max-h-80 overflow-y-auto">
            {selectedBlocks.map((b) => {
              const def = typeMeta.get(b.type);
              return (
                <div key={b.id} className="flex items-start gap-2 rounded-lg border p-2">
                  {def && <def.icon className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{def?.label ?? b.type}</p>
                    <p className="text-xs truncate">{b.title || b.resultTitle || '—'}</p>
                    {b.showIf?.enabled && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-semibold text-amber-500">
                        <Eye className="h-2.5 w-2.5" /> exibição condicional ativa
                      </span>
                    )}
                  </div>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function QuizFlowView({ schema }: { schema: QuizSchema }) {
  return (
    <ReactFlowProvider>
      <FlowCanvas schema={schema} />
    </ReactFlowProvider>
  );
}
