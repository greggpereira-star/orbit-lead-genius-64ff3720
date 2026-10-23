import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { listStages, moveLeadToStage, type Stage } from "../services/stageService";
import { LossReasonDialog } from "./LossReasonDialog";

/**
 * Etapa editável na própria pill.
 *
 * Lê as etapas reais da empresa, não uma lista fixa. Antes eram sete rótulos
 * codificados aqui dentro que gravavam `leads.status`, enquanto o pipeline lia
 * `leads.stage_id` — mudar a etapa aqui não mexia o card no board, e vice-versa.
 * Agora as duas telas escrevem pelo mesmo `moveLeadToStage`.
 */
export function EtapaDoLead({
  leadId,
  companyId,
  leadName,
  stageId,
  somenteLeitura = false,
  onChanged,
}: {
  leadId: string;
  companyId: string;
  leadName: string | null;
  /** Etapa atual do lead; acompanha mudanças que vierem de fora (etiqueta, automação). */
  stageId: string | null;
  somenteLeitura?: boolean;
  /** Recebe o id da etapa nova depois de mover. */
  onChanged?: (stageId: string) => void;
}) {
  const qc = useQueryClient();
  const [currentId, setCurrentId] = useState<string | null>(stageId);

  // O lead pode mudar de etapa por fora deste seletor (etiqueta do CRM, automação): quando a
  // etapa do lead recebido muda, o seletor acompanha em vez de ficar com a leitura de quando abriu.
  useEffect(() => {
    setCurrentId(stageId);
  }, [stageId]);

  const stagesQuery = useQuery({
    queryKey: ["stages", companyId],
    queryFn: () => listStages(companyId),
    enabled: Boolean(companyId),
  });
  const stages = stagesQuery.data ?? [];
  const current = stages.find((s) => s.id === currentId) ?? null;

  /* Mesma regra do board: etapa de perda pergunta o motivo antes de gravar.
     Os dois caminhos de escrita precisam concordar, senão trocar a etapa pela
     ficha produziria perda sem motivo — o buraco que este item veio fechar. */
  const [perguntandoMotivo, setPerguntandoMotivo] = useState<Stage | null>(null);

  const mutation = useMutation({
    mutationFn: (v: { stage: Stage; lossReasonId?: string | null; lostNotes?: string | null }) =>
      moveLeadToStage({
        leadId,
        stageId: v.stage.id,
        // O modal não conhece a posição na coluna; entra no topo, que é onde
        // um lead recém-mexido faz sentido estar.
        boardOrder: 0,
        fromStageName: current?.name ?? null,
        toStageName: v.stage.name,
        lossReasonId: v.lossReasonId ?? null,
        lostNotes: v.lostNotes ?? null,
        stages,
      }),
    onSuccess: (_, v) => {
      setCurrentId(v.stage.id);
      onChanged?.(v.stage.id);
      // A lista e o board atrás do modal precisam refletir a mudança na hora.
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Etapa alterada para ${v.stage.name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const label = current?.name ?? "Sem etapa";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={somenteLeitura || mutation.isPending || stagesQuery.isLoading}
          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium max-sm:min-h-10 max-sm:px-3.5 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          style={
            current
              ? {
                  borderColor: `${current.color}55`,
                  backgroundColor: `${current.color}14`,
                  color: current.color,
                }
              : undefined
          }
          aria-label={`Etapa atual: ${label}. Clique para alterar.`}
        >
          {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {stages.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={() => {
              if (s.id === currentId) return;
              if (s.kind === "lost") {
                setPerguntandoMotivo(s);
                return;
              }
              mutation.mutate({ stage: s });
            }}
            className="gap-2"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
            {s.id === currentId && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>

      {perguntandoMotivo && (
        <LossReasonDialog
          companyId={companyId}
          leadName={leadName || "este lead"}
          open
          onConfirm={(motivoId, observacao) => {
            mutation.mutate({
              stage: perguntandoMotivo,
              lossReasonId: motivoId,
              lostNotes: observacao,
            });
            setPerguntandoMotivo(null);
          }}
          // Aqui nada se moveu ainda — a ficha só grava depois de confirmar —
          // então cancelar não precisa desfazer coisa alguma.
          onCancel={() => setPerguntandoMotivo(null)}
        />
      )}
    </DropdownMenu>
  );
}

/**
 * Fechar o negócio sem sair da conversa: "Ganho" e "Perdido" levam o lead à primeira etapa
 * desse tipo. Perdido pergunta o motivo antes (o mesmo diálogo do CRM) — sem ele o registro de
 * perda não serve para nada. Quem já está numa etapa final vê o estado e a opção de reabrir
 * pelo seletor de etapa, não por aqui.
 */
export function FecharNegocio({
  leadId,
  companyId,
  leadName,
  stageId,
  onChanged,
}: {
  leadId: string;
  companyId: string;
  leadName: string | null;
  stageId: string | null;
  onChanged?: (stageId: string) => void;
}) {
  const qc = useQueryClient();
  const [perguntando, setPerguntando] = useState(false);

  const stagesQuery = useQuery({
    queryKey: ["stages", companyId],
    queryFn: () => listStages(companyId),
    enabled: Boolean(companyId),
  });
  const stages = stagesQuery.data ?? [];
  const atual = stages.find((s) => s.id === stageId) ?? null;
  const ganho = stages.find((s) => s.kind === "won") ?? null;
  const perdido = stages.find((s) => s.kind === "lost") ?? null;

  const mutation = useMutation({
    mutationFn: (v: { stage: Stage; lossReasonId?: string | null; lostNotes?: string | null }) =>
      moveLeadToStage({
        leadId,
        stageId: v.stage.id,
        boardOrder: 0,
        fromStageName: atual?.name ?? null,
        toStageName: v.stage.name,
        lossReasonId: v.lossReasonId ?? null,
        lostNotes: v.lostNotes ?? null,
        stages,
      }),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Etapa alterada para ${v.stage.name}`);
      onChanged?.(v.stage.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Já está numa etapa final: nada a fechar. O seletor de etapa reabre.
  if (!ganho && !perdido) return null;
  if (atual && atual.kind !== "open") return null;

  return (
    <div className="flex gap-2 pt-1">
      {ganho && (
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ stage: ganho })}
          className="flex-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60 max-sm:min-h-11"
        >
          Marcar ganho
        </button>
      )}
      {perdido && (
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => setPerguntando(true)}
          className="flex-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-60 max-sm:min-h-11"
        >
          Marcar perdido
        </button>
      )}
      {perguntando && perdido && (
        <LossReasonDialog
          companyId={companyId}
          leadName={leadName || "este lead"}
          open
          onConfirm={(motivoId, observacao) => {
            mutation.mutate({ stage: perdido, lossReasonId: motivoId, lostNotes: observacao });
            setPerguntando(false);
          }}
          onCancel={() => setPerguntando(false)}
        />
      )}
    </div>
  );
}
