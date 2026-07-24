import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Node,
  type Edge,
  type EdgeProps,
  Position,
  Handle,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LayoutGrid, Eye, ArrowDownWideNarrow, X, CheckCircle2, Target, Pencil, Trash2, Plus } from 'lucide-react';
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

// Ações de edição direto no fluxograma (opcionais — quando ausentes, o card fica
// só-leitura, ex.: nenhum handler passado). Espelha o padrão de mutação/autosave já
// usado no Builder (updateSchema + toast de confirmação/desfazer).
export interface QuizFlowActions {
  onSelectStep?: (stepId: string) => void;
  onRenameStep?: (stepId: string, name: string | undefined) => void;
  onDeleteStep?: (stepId: string) => void;
  onToggleGoal?: (stepId: string) => void;
  onInsertStepAfter?: (stepId: string) => void;
}

// ============ Nó de Etapa: miniatura ao vivo + cabeçalho/rodapé de metadados ============

interface StepNodeData extends QuizFlowActions {
  step: QuizStep;
  blocks: QuizBlock[];
  index: number;
  total: number;
  design: QuizDesign;
  [key: string]: unknown;
}

function StepNode({ data }: { data: StepNodeData }) {
  const { step, blocks, index, design, onSelectStep, onRenameStep, onDeleteStep, onToggleGoal } = data;
  const dominant = blocks[blocks.length - 1] ?? blocks[0];
  const def = dominant ? typeMeta.get(dominant.type) : undefined;
  const hasConditional = blocks.some((b) => b.showIf?.enabled);
  const hasBranch = blocks.some((b) => (b.options ?? []).some((o) => o.jumpToBlockId) || (b.logicRules?.length ?? 0) > 0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(step.name ?? '');
  // handles/borda do card usam a cor de marca do PRÓPRIO quiz (design.primary), não a cor
  // genérica da UI do app — mesmo tratamento que o Funilix usa nos handles do fluxograma.
  // Etapa marcada como meta de conversão ganha um contorno esmeralda em vez da cor de marca.
  const themeHandleStyle = { background: design.background, border: `2px solid ${design.primary}` };
  const borderColor = step.isGoal ? '#10b98199' : `${design.primary}55`;
  const boxShadow = step.isGoal ? '0 6px 20px rgba(16,185,129,0.25)' : `0 6px 20px ${design.primary}1a`;

  const commitRename = () => {
    setEditing(false);
    const trimmed = draft.trim();
    onRenameStep?.(step.id, trimmed.length > 0 ? trimmed : undefined);
  };

  return (
    <div
      className="rounded-xl border-2 bg-card shadow-md overflow-visible transition-all hover:shadow-xl hover:-translate-y-0.5 cursor-pointer"
      style={{ width: STEP_WIDTH, borderColor, boxShadow }}
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
        {editing ? (
          <input
            autoFocus
            value={draft}
            placeholder={`Etapa ${index + 1}`}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setDraft(step.name ?? ''); setEditing(false); }
            }}
            className="min-w-0 flex-1 rounded border bg-background px-1.5 py-0.5 text-[11px] font-semibold outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
        ) : (
          <span className="text-[11px] font-bold text-foreground truncate">
            {step.name || `Etapa ${index + 1}`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {step.isGoal && (
            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600">
              Meta
            </span>
          )}
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
          {(onToggleGoal || onRenameStep || onDeleteStep) && (
            <div className="flex items-center gap-0.5 border-l pl-1 ml-0.5">
              {onToggleGoal && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleGoal(step.id); }}
                  title={step.isGoal ? 'Desmarcar meta de conversão' : 'Marcar etapa como meta de conversão'}
                  className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${step.isGoal ? 'text-emerald-600 hover:bg-emerald-500/10' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                >
                  <Target className="h-3.5 w-3.5" />
                </button>
              )}
              {onRenameStep && (
                <button
                  onClick={(e) => { e.stopPropagation(); setDraft(step.name ?? ''); setEditing(true); }}
                  title="Renomear etapa"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {onDeleteStep && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteStep(step.id); }}
                  title="Excluir etapa"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
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
            <ProgressBar design={design} value={(index + 1) / Math.max(data.total, 1)} />
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

// ============ Edge de fluxo principal com botão "+" no meio, pra inserir uma etapa nova
// direto na conexão — mesmo padrão do "edgeWithButton" que vimos no Funilix. Só as
// conexões sequenciais ganham o botão (inserir numa ramificação seria ambíguo). ============

interface StepEdgeData {
  onInsert?: () => void;
  [key: string]: unknown;
}

function StepEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const onInsert = (data as StepEdgeData | undefined)?.onInsert;
  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      {onInsert && (
        <EdgeLabelRenderer>
          <button
            onClick={(e) => { e.stopPropagation(); onInsert(); }}
            title="Inserir etapa aqui"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className="nodrag nopan pointer-events-auto absolute flex h-6 w-6 items-center justify-center rounded-full border-2 border-primary bg-card text-primary shadow-md transition-transform hover:scale-110 hover:bg-primary hover:text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { stepEdge: StepEdge };

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

function buildGraph(schema: QuizSchema, actions: QuizFlowActions) {
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
      data: { step: s, blocks: stepBlocks, index: i, total: steps.length, design, ...actions },
      draggable: true,
    };
  });

  // Conexões animadas (pontilhado "andando" pela linha): inspecionamos o DOM do fluxograma
  // do Funilix e confirmamos que TODA conexão usa stroke-dasharray + a animação
  // @keyframes dashdraw já embutida no CSS padrão do React Flow (importado no topo deste
  // arquivo) — bastava marcar animated:true em todas, não só nas de ramificação, pra ganhar
  // o mesmo efeito de "energia fluindo". A sequencial usa a cor de marca do quiz (largo,
  // pontilhado) e a de ramificação um pontilhado mais fino em âmbar — mais um leve brilho
  // (drop-shadow) nas duas pra um acabamento mais bonito. A sequencial também ganha um botão
  // "+" no meio pra inserir uma etapa nova ali (mesmo padrão do "edgeWithButton" do Funilix).
  const AMBER = '#f59e0b';
  const edges: Edge[] = rawEdges.map((e) => {
    const color = e.branch ? AMBER : design.primary;
    return {
      id: `${e.source}->${e.target}::${e.label ?? ''}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.branch ? 'branch-source' : undefined,
      targetHandle: e.branch ? 'branch-target' : undefined,
      label: e.label,
      animated: true,
      style: {
        stroke: color,
        strokeWidth: e.branch ? 2.5 : 3,
        strokeDasharray: e.branch ? '2 6' : '8 5',
        strokeLinecap: 'round' as const,
        filter: `drop-shadow(0 0 4px ${color}99)`,
      },
      markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color },
      labelStyle: { fontSize: 10, fill: e.branch ? '#b45309' : color, fontWeight: 700 },
      labelBgStyle: { fillOpacity: 0.95, fill: 'var(--card)' },
      labelBgPadding: [5, 3] as [number, number],
      labelBgBorderRadius: 6,
      type: e.branch ? 'smoothstep' : 'stepEdge',
      data: e.branch ? undefined : { onInsert: () => actions.onInsertStepAfter?.(e.source) },
      zIndex: e.branch ? 0 : 1,
    };
  });

  return { nodes, edges };
}

function FlowCanvas({ schema, actions }: { schema: QuizSchema; actions: QuizFlowActions }) {
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const fullActions = useMemo<QuizFlowActions>(
    () => ({ ...actions, onSelectStep: (stepId) => setSelectedStepId(stepId) }),
    [actions]
  );
  const { nodes: initialNodes, edges } = useMemo(() => buildGraph(schema, fullActions), [schema, fullActions]);
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState(initialNodes);
  const { fitView } = useReactFlow();
  // Só re-posicionar manualmente arrastado é "sagrado" — inserir/excluir uma etapa muda o
  // índice sequencial de TODAS as etapas depois dela, então preservar a posição de todo mundo
  // (não só de quem foi arrastado) faria o card novo nascer sobreposto num card antigo, que
  // ficou "grudado" na coordenada calculada pra um índice que já não é mais o dele.
  const draggedIds = useRef(new Set<string>());

  const onNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChangeRaw>[0]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.dragging === false) draggedIds.current.add(change.id);
      }
      onNodesChangeRaw(changes);
    },
    [onNodesChangeRaw]
  );

  // Sincroniza os nós sempre que o schema muda (ex.: renomear/excluir/inserir etapa): quem já
  // foi arrastado manualmente mantém a posição; todo o resto sempre segue o layout automático
  // recalculado, senão ordens antigas ficam ancoradas em coordenadas de um índice que não
  // existe mais assim que uma etapa é inserida ou removida no meio do fluxo.
  useEffect(() => {
    setNodes((prev) => {
      const posById = new Map(prev.map((n) => [n.id, n.position]));
      return initialNodes.map((n) =>
        draggedIds.current.has(n.id) && posById.has(n.id) ? { ...n, position: posById.get(n.id)! } : n
      );
    });
  }, [initialNodes, setNodes]);

  const handleReorganize = useCallback(() => {
    draggedIds.current.clear();
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
        edgeTypes={edgeTypes}
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
            <p className="text-xs font-bold">{selectedStep.name || `Etapa ${steps.indexOf(selectedStep) + 1}`}</p>
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

export function QuizFlowView({ schema, ...actions }: { schema: QuizSchema } & QuizFlowActions) {
  return (
    <ReactFlowProvider>
      <FlowCanvas schema={schema} actions={actions} />
    </ReactFlowProvider>
  );
}
