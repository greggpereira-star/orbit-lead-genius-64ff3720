import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
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
import type { QuizBlock, QuizDesign, QuizSchema, QuizStep } from '../types';
import { BlockRenderer, ProgressBar } from './QuizPreview';

// Cada nó do fluxograma é uma miniatura AO VIVO da tela real (mesmo BlockRenderer do
// canvas do Builder) — em tamanho NATURAL, sem transform: scale e sem corte de altura,
// pra cada card aparecer por inteiro (o zoom do próprio canvas do React Flow é o que dá
// a visão "reduzida" quando há muitas etapas, exatamente como o Funilix faz — inspecionamos
// o DOM do builder deles ao vivo: os nós renderizam a ~470px de largura real, sem hack de
// escala interna, e a cor de marca do quiz (design.primary) tinge a borda do card e os
// handles de conexão, não a paleta genérica da UI do app).
const SCREEN_WIDTH = 400;
const STEP_WIDTH = SCREEN_WIDTH + 32;
const STEP_GAP_X = STEP_WIDTH + 100;
// Altura variável (conteúdo real, sem corte) — a raia secundária de ramificação usa um
// espaçamento generoso fixo pra evitar sobreposição mesmo com etapas mais longas (form,
// pricing, comparação); não é uma medição exata do conteúdo, mas cobre a grande maioria.
const LANE_GAP_Y = 820;

const typeMeta = new Map(BLOCK_LIBRARY.map((def) => [def.type, def]));

// ============ Nó de Etapa: miniatura ao vivo + cabeçalho/rodapé de metadados ============

interface StepNodeData {
  step: QuizStep;
  blocks: QuizBlock[];
  index: number;
  total: number;
  design: QuizDesign;
  onSelectStep?: (stepId: string) => void;
  [key: string]: unknown;
}

function StepNode({ data }: { data: StepNodeData }) {
  const { step, blocks, index, total, design, onSelectStep } = data;
  const dominant = blocks[blocks.length - 1] ?? blocks[0];
  const def = dominant ? typeMeta.get(dominant.type) : undefined;
  const hasConditional = blocks.some((b) => b.showIf?.enabled);
  const hasBranch = blocks.some((b) => (b.options ?? []).some((o) => o.jumpToBlockId) || (b.logicRules?.length ?? 0) > 0);
  // handles/borda do card usam a cor de marca do PRÓPRIO quiz (design.primary), não a cor
  // genérica da UI do app — mesmo tratamento que o Funilix usa nos handles do fluxograma.
  const themeHandleStyle = { background: design.background, border: `2px solid ${design.primary}` };

  return (
    <div
      className="rounded-xl border-2 bg-card shadow-md overflow-visible transition-all hover:shadow-xl hover:-translate-y-0.5 cursor-pointer"
      style={{ width: STEP_WIDTH, borderColor: `${design.primary}55`, boxShadow: `0 6px 20px ${design.primary}1a` }}
      onClick={() => onSelectStep?.(step.id)}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3" style={themeHandleStyle} />
      <Handle
        type="target"
        id="branch-target"
        position={Position.Top}
        className="!bg-amber-500 !w-2.5 !h-2.5 !border-2 !border-background"
      />

      <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-muted/40 rounded-t-[10px]">
        <span className="flex items-center justify-center h-5 w-5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold shrink-0">
          {index + 1}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground truncate">
          Etapa {index + 1} de {total}
        </span>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {hasBranch && (
            <span
              className="flex items-center justify-center h-4 w-4 rounded-full bg-amber-500/15 text-amber-500"
              title="Tem ramificação (pular para outra etapa)"
            >
              <ArrowDownWideNarrow className="h-2.5 w-2.5 rotate-[-90deg]" />
            </span>
          )}
          {hasConditional && (
            <span
              className="flex items-center justify-center h-4 w-4 rounded-full bg-amber-500/15 text-amber-500"
              title="Contém bloco com exibição condicional"
            >
              <Eye className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      </div>

      {/* miniatura em tamanho natural — sem transform: scale, sem altura fixa, sem corte:
          a etapa aparece por inteiro, como no Funilix. */}
      <div className="p-3">
        <div
          className="mx-auto rounded-lg border overflow-hidden"
          style={{ width: SCREEN_WIDTH, background: design.background, fontFamily: design.fontBody }}
        >
          <div className="px-6 pt-6 pb-4">
            <ProgressBar design={design} value={(index + 1) / Math.max(total, 1)} />
          </div>
          <div className="px-6 pb-8 flex flex-col gap-8">
            {blocks.map((b) => (
              <div key={b.id} className="pointer-events-none">
                <BlockRenderer block={b} design={design} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 py-1.5 border-t bg-muted/30 flex items-center justify-between rounded-b-[10px]">
        <span className="text-[9px] text-muted-foreground truncate">{def?.label ?? dominant?.type}</span>
        <span className="text-[9px] text-muted-foreground shrink-0">{blocks.length} {blocks.length === 1 ? 'módulo' : 'módulos'}</span>
      </div>

      <Handle type="source" position={Position.Right} className="!w-3 !h-3" style={themeHandleStyle} />
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
  const design = schema.design;

  const nodes: Node[] = steps.map((s, i) => {
    const pos = positions.get(s.id) ?? { x: i * STEP_GAP_X, y: 0 };
    const stepBlocks = s.blockIds.map((id) => blocksById.get(id)).filter(Boolean) as QuizBlock[];
    return {
      id: s.id,
      type: 'step',
      position: { x: pos.x, y: pos.y },
      data: { step: s, blocks: stepBlocks, index: i, total: steps.length, design, onSelectStep },
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
      ? { stroke: 'hsl(38 92% 50%)', strokeWidth: 2 }
      : { stroke: 'var(--primary)', strokeWidth: 2.5 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
      color: e.branch ? 'hsl(38 92% 50%)' : 'var(--primary)',
    },
    labelStyle: { fontSize: 10, fill: 'hsl(38 92% 40%)', fontWeight: 700 },
    labelBgStyle: { fillOpacity: 0.95, fill: 'var(--card)' },
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
        minZoom={0.1}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} className="opacity-40" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-card !border !rounded-lg" nodeColor="var(--primary)" maskColor="rgba(0,0,0,0.06)" />
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
