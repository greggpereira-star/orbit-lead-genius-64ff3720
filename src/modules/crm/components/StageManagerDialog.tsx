/**
 * Gestão das etapas do funil.
 *
 * Não existia nenhuma tela para isso: as etapas vinham de um seed automático e
 * ficavam congeladas. Um funil de imobiliária ("Visita agendada", "Proposta
 * enviada") não é o mesmo de uma clínica ("Avaliação", "Procedimento"), então
 * o funil precisa ser do cliente.
 */
import { useEffect, useMemo, useState } from 'react';
import { ConversionSettingsTable } from '@/modules/crm/components/ConversionSettingsTable';
import { LossReasonsManager } from '@/modules/crm/components/LossReasonsManager';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listConversionMappings } from '@/modules/crm/services/conversionMappingService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { GripVertical, Plus, Trash2, Loader2, Flag, Check, Filter, Layers, Link2, DollarSign } from 'lucide-react';

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
  const [aba, setAba] = useState('etapas');

  // Mesma condição da lista de etapas: só busca com o diálogo aberto.
  const mappingsQuery = useQuery({
    queryKey: ['conversion-mappings', companyId],
    queryFn: () => listConversionMappings(companyId),
    enabled: Boolean(companyId) && open,
  });

  const stagesQuery = useQuery({
    queryKey: ['stages', companyId],
    queryFn: () => listStages(companyId),
    enabled: Boolean(companyId) && open,
  });

  /* Conta o que está GRAVADO. A tabela tem rascunho próprio, e espelhar o
     rascunho aqui faria o número piscar a cada clique antes de valer. */
  const resumo = useMemo(() => {
    const mapas = mappingsQuery.data ?? [];
    const ativos = mapas.filter((m) => m.is_active && m.meta_event_name);
    return {
      etapas: (stagesQuery.data ?? []).length,
      eventos: ativos.length,
      comValor: mapas.filter((m) => m.is_active && m.send_deal_value).length,
    };
  }, [mappingsQuery.data, stagesQuery.data]);

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
        {/* Larga o suficiente para a tabela de conversões caber sem cortar a
            última coluna — era o interruptor de valor que sumia na borda. E com
            altura limitada ao viewport, senão sete etapas mais as explicações
            estouram a tela em notebook. */}
        {/* Só o corpo rola. Antes o diálogo inteiro rolava, e o título e as
            abas saíam de cena assim que a lista passava da altura — a pessoa
            perdia de vista em qual aba estava e como voltar. */}
        <DialogContent className="flex max-h-[92dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b px-6 py-5 text-left">
            <div className="flex items-start gap-3">
              {/* O ícone não é enfeite: ele é o mesmo funil do Kanban, e dá
                  ao diálogo a identidade da tela de onde ele veio. */}
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Filter className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg">Etapas do funil</DialogTitle>
                <DialogDescription>
                  Arraste para reordenar. A etapa de entrada é onde o lead cai quando a
                  integração não escolhe outra.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Tabs
            value={aba}
            onValueChange={setAba}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-6 pt-4">
            <TabsList className="shrink-0 self-start">
              <TabsTrigger value="etapas">Etapas</TabsTrigger>
              {/* Separado porque são duas perguntas diferentes: "quais são os
                  degraus" e "o que cada degrau significa". Misturar obrigava a
                  expandir etapa por etapa para enxergar o funil inteiro. */}
              <TabsTrigger value="conversoes">Conversões</TabsTrigger>
              {/* Mesma decisão das outras duas: como este negócio descreve o
                  próprio funil — inclusive a saída dele. */}
              <TabsTrigger value="perdas">Motivos de perda</TabsTrigger>
            </TabsList>

            {/* Resumo do funil, só onde ele descreve o que está na tela. Nas
                outras abas seria um número solto sem nada para explicá-lo. */}
            {aba === 'conversoes' && (
              <div className="flex flex-wrap gap-2">
                <Resumo icone={<Layers className="h-4 w-4" />} numero={resumo.etapas} titulo="etapas" legenda="no funil" />
                <Resumo icone={<Link2 className="h-4 w-4" />} numero={resumo.eventos} titulo="eventos" legenda="mapeados" />
                <Resumo
                  icone={<DollarSign className="h-4 w-4" />}
                  numero={resumo.comValor}
                  titulo={resumo.comValor === 1 ? 'conversão' : 'conversões'}
                  legenda="com valor"
                  destaque
                />
              </div>
            )}
            </div>
            <TabsContent value="etapas" className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">

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
                          className={`rounded-lg border bg-card p-2.5 ${
                            snap.isDragging ? 'shadow-lg ring-2 ring-primary/30' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
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
            </TabsContent>
            {/* Sem overflow aqui: a tabela de conversões tem rodapé fixo e
                cuida da própria rolagem. */}
            <TabsContent value="conversoes" className="flex min-h-0 flex-1 flex-col px-6 py-4">
              <ConversionSettingsTable companyId={companyId} onClose={() => onOpenChange(false)} />
            </TabsContent>
            <TabsContent value="perdas" className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <LossReasonsManager companyId={companyId} />
            </TabsContent>
          </Tabs>
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

/**
 * Um número do funil, com o que ele conta logo abaixo.
 *
 * Três cartões em vez de uma frase porque são grandezas diferentes — degraus,
 * eventos, valor — e quem configura compara as três entre si: "sete etapas e
 * só um evento" é a leitura que faz a pessoa voltar para a tabela.
 */
function Resumo({
  icone, numero, titulo, legenda, destaque,
}: {
  icone: React.ReactNode;
  numero: number;
  titulo: string;
  legenda: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          destaque ? 'bg-emerald-600/10 text-emerald-600' : 'bg-primary/10 text-primary'
        }`}
      >
        {icone}
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold">
          {numero} <span className="font-medium text-muted-foreground">{titulo}</span>
        </p>
        <p className="text-xs text-muted-foreground">{legenda}</p>
      </div>
    </div>
  );
}
