/**
 * Gestão das etapas do funil.
 *
 * Não existia nenhuma tela para isso: as etapas vinham de um seed automático e
 * ficavam congeladas. Um funil de imobiliária ("Visita agendada", "Proposta
 * enviada") não é o mesmo de uma clínica ("Avaliação", "Procedimento"), então
 * o funil precisa ser do cliente.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { GripVertical, Plus, Trash2, Loader2, Flag, Check } from 'lucide-react';

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  listStages, createStage, updateStage, reorderStages, deleteStage, setEntryStage,
  STAGE_COLORS, type Stage, type StageKind,
} from '../services/stageService';

const KIND_LABEL: Record<StageKind, string> = {
  open: 'Em andamento',
  won: 'Ganho',
  lost: 'Perdido',
};

interface Props {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StageManagerDialog({ companyId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Stage | null>(null);
  const [moveTarget, setMoveTarget] = useState<string>('');
  /* Cópia local para o arrastar responder na hora: reordenar são N updates, e
     esperar todos antes de redesenhar faria a lista "pular" de volta. */
  const [order, setOrder] = useState<Stage[]>([]);

  const stagesQuery = useQuery({
    queryKey: ['stages', companyId],
    queryFn: () => listStages(companyId),
    enabled: Boolean(companyId) && open,
  });

  useEffect(() => {
    if (stagesQuery.data) setOrder(stagesQuery.data);
  }, [stagesQuery.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['stages', companyId] });
    qc.invalidateQueries({ queryKey: ['leads'] });
  };

  const createMutation = useMutation({
    mutationFn: () => createStage(companyId, newName),
    onSuccess: () => {
      setNewName('');
      invalidate();
      toast.success('Etapa criada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (v: { id: string; patch: Partial<Pick<Stage, 'name' | 'color' | 'kind'>> }) =>
      updateStage(v.id, v.patch),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const entryMutation = useMutation({
    mutationFn: (id: string) => setEntryStage(companyId, id),
    onSuccess: () => {
      invalidate();
      toast.success('Etapa de entrada definida');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderStages(ids),
    onSuccess: invalidate,
    onError: (e: Error) => {
      toast.error(e.message);
      if (stagesQuery.data) setOrder(stagesQuery.data);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (v: { id: string; target: string }) => deleteStage(v.id, v.target),
    onSuccess: () => {
      setPendingDelete(null);
      setMoveTarget('');
      invalidate();
      toast.success('Etapa excluída e leads realocados');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const next = Array.from(order);
    const [moved] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, moved);
    setOrder(next);
    reorderMutation.mutate(next.map((s) => s.id));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Etapas do funil</DialogTitle>
            <DialogDescription>
              Arraste para reordenar. A etapa de entrada é onde o lead cai quando a
              integração não escolhe outra.
            </DialogDescription>
          </DialogHeader>

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="stages">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="max-h-[50vh] space-y-2 overflow-y-auto pr-1"
                >
                  {order.map((stage, index) => (
                    <Draggable key={stage.id} draggableId={stage.id} index={index}>
                      {(dp, snap) => (
                        <div
                          ref={dp.innerRef}
                          {...dp.draggableProps}
                          className={`flex items-center gap-2 rounded-lg border bg-card p-2.5 ${
                            snap.isDragging ? 'shadow-lg ring-2 ring-primary/30' : ''
                          }`}
                        >
                          <span
                            {...dp.dragHandleProps}
                            aria-label={`Reordenar ${stage.name}`}
                            className="cursor-grab rounded text-muted-foreground/50 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>

                          {/* Cor: um seletor nativo é o único jeito honesto de
                              oferecer cor livre sem inventar um color picker. */}
                          <label
                            className="relative h-6 w-6 shrink-0 cursor-pointer rounded-md ring-1 ring-inset ring-black/10"
                            style={{ backgroundColor: stage.color }}
                            title={`Cor de ${stage.name}`}
                          >
                            <input
                              type="color"
                              value={stage.color}
                              onChange={(e) =>
                                updateMutation.mutate({ id: stage.id, patch: { color: e.target.value } })
                              }
                              className="absolute inset-0 cursor-pointer opacity-0"
                              aria-label={`Cor da etapa ${stage.name}`}
                            />
                          </label>

                          <Input
                            defaultValue={stage.name}
                            onBlur={(e) => {
                              const name = e.target.value.trim();
                              if (name && name !== stage.name) {
                                updateMutation.mutate({ id: stage.id, patch: { name } });
                              }
                            }}
                            className="h-8 flex-1 text-sm"
                            aria-label={`Nome da etapa ${stage.name}`}
                          />

                          <Select
                            value={stage.kind}
                            onValueChange={(kind) =>
                              updateMutation.mutate({ id: stage.id, patch: { kind: kind as StageKind } })
                            }
                          >
                            <SelectTrigger className="h-8 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(Object.keys(KIND_LABEL) as StageKind[]).map((k) => (
                                <SelectItem key={k} value={k} className="text-xs">
                                  {KIND_LABEL[k]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${
                              stage.is_entry ? 'text-primary' : 'text-muted-foreground/50'
                            }`}
                            title={stage.is_entry ? 'Etapa de entrada' : 'Definir como etapa de entrada'}
                            onClick={() => !stage.is_entry && entryMutation.mutate(stage.id)}
                          >
                            {stage.is_entry ? <Check className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
                            <span className="sr-only">
                              {stage.is_entry ? 'É a etapa de entrada' : 'Definir como etapa de entrada'}
                            </span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            title="Excluir etapa"
                            disabled={order.length <= 1}
                            onClick={() => {
                              setPendingDelete(stage);
                              setMoveTarget(order.find((s) => s.id !== stage.id)?.id ?? '');
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Excluir etapa {stage.name}</span>
                          </Button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          <div className="flex items-end gap-2 border-t pt-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="nova-etapa" className="text-xs text-muted-foreground">
                Nova etapa
              </Label>
              <Input
                id="nova-etapa"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) createMutation.mutate();
                }}
                placeholder="Ex.: Visita agendada"
                className="h-9"
              />
            </div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newName.trim() || createMutation.isPending}
              className="h-9"
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Adicionar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Excluir etapa exige destino: a FK é ON DELETE SET NULL, então apagar
          sem realocar deixaria os leads com stage_id NULL — invisíveis no
          board. É exatamente assim que os 106 leads sumiram. */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Os leads que estão nesta etapa precisam ir para outra, senão sumiriam do
              pipeline.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="destino" className="text-xs text-muted-foreground">
              Mover os leads para
            </Label>
            <Select value={moveTarget} onValueChange={setMoveTarget}>
              <SelectTrigger id="destino">
                <SelectValue placeholder="Escolha a etapa de destino" />
              </SelectTrigger>
              <SelectContent>
                {order
                  .filter((s) => s.id !== pendingDelete?.id)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!moveTarget || deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete && moveTarget) {
                  deleteMutation.mutate({ id: pendingDelete.id, target: moveTarget });
                }
              }}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir etapa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
