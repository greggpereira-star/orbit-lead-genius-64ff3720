import { useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { BLOCK_LIBRARY } from '../blocks-library';
import type { QuizSchema } from '../types';

const NODE_WIDTH = 220;
const NODE_GAP_X = 280;

const typeMeta = new Map(BLOCK_LIBRARY.map((def) => [def.type, def]));

function BlockNode({ data }: { data: { label: string; type: string; index: number } }) {
  const def = typeMeta.get(data.type as never);
  const Icon = def?.icon;
  return (
    <div
      className="rounded-lg border bg-card shadow-sm px-3 py-2.5"
      style={{ width: NODE_WIDTH }}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary !w-2 !h-2" />
      <Handle type="target" id="branch-target" position={Position.Bottom} className="!bg-amber-500 !w-2 !h-2" style={{ left: '30%' }} />
      <div className="flex items-center gap-2 mb-1">
        <span className="flex items-center justify-center h-5 w-5 rounded bg-primary/10 text-primary text-[10px] font-bold shrink-0">
          {data.index + 1}
        </span>
        {Icon && <Icon className="h-3.5 w-3.5 text-primary shrink-0" />}
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{def?.label ?? data.type}</span>
      </div>
      <p className="text-xs font-medium leading-snug truncate">{data.label}</p>
      <Handle type="source" position={Position.Right} className="!bg-primary !w-2 !h-2" />
      <Handle type="source" id="branch-source" position={Position.Bottom} className="!bg-amber-500 !w-2 !h-2" style={{ left: '70%' }} />
    </div>
  );
}

const nodeTypes = { block: BlockNode };

export function QuizFlowView({ schema }: { schema: QuizSchema }) {
  const { nodes, edges } = useMemo(() => {
    const blocks = schema.blocks;
    const indexById = new Map(blocks.map((b, i) => [b.id, i]));

    const nodes: Node[] = blocks.map((b, i) => ({
      id: b.id,
      type: 'block',
      position: { x: i * NODE_GAP_X, y: 0 },
      data: {
        label: b.title || b.resultTitle || `Bloco ${i + 1}`,
        type: b.type,
        index: i,
      },
      draggable: true,
    }));

    const edges: Edge[] = [];
    const addedEdgeKeys = new Set<string>();
    const addEdge = (source: string, target: string, label?: string, variant: 'default' | 'branch' = 'default') => {
      const key = `${source}->${target}::${label ?? ''}`;
      if (addedEdgeKeys.has(key)) return;
      addedEdgeKeys.add(key);
      edges.push({
        id: key,
        source,
        target,
        sourceHandle: variant === 'branch' ? 'branch-source' : undefined,
        targetHandle: variant === 'branch' ? 'branch-target' : undefined,
        label,
        animated: variant === 'branch',
        style: variant === 'branch' ? { stroke: 'hsl(38 92% 50%)' } : undefined,
        labelStyle: { fontSize: 10, fill: 'hsl(38 92% 40%)', fontWeight: 600 },
        labelBgStyle: { fillOpacity: 0.9 },
        type: 'smoothstep',
        zIndex: variant === 'branch' ? 0 : 1,
      });
    };

    blocks.forEach((b, i) => {
      const next = blocks[i + 1];
      if (next) addEdge(b.id, next.id);

      for (const opt of b.options ?? []) {
        if (opt.jumpToBlockId && indexById.has(opt.jumpToBlockId)) {
          addEdge(b.id, opt.jumpToBlockId, opt.label, 'branch');
        }
      }
      for (const rule of b.logicRules ?? []) {
        if (indexById.has(rule.jumpToBlockId)) {
          addEdge(b.id, rule.jumpToBlockId, 'condição', 'branch');
        }
      }
    });

    return { nodes, edges };
  }, [schema]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Adicione blocos ao quiz para ver o fluxograma.
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable className="!bg-card" />
    </ReactFlow>
  );
}
