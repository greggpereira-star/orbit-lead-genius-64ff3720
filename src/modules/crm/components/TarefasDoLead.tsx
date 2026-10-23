import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { cn } from "@/lib/utils";
import { createLeadNote, listLeadNotes, toggleNoteDone } from "../services/leadNotesService";
import { listarMembrosDaEquipe } from "../services/teamService";
import {
  contarAbertas,
  ehTarefa,
  ordenarTarefas,
  prazosRapidos,
  rotuloDoPrazo,
  type SituacaoDoPrazo,
} from "../lib/tarefas";

/** As tarefas do lead: as anotações com data, de qualquer tela (ficha do CRM ou conversa). */
export function useTarefasDoLead(leadId: string | null) {
  return useQuery({
    queryKey: ["lead-notes", leadId ?? ""],
    enabled: Boolean(leadId),
    queryFn: () => listLeadNotes(leadId as string),
    select: (notas) => ordenarTarefas(notas.filter(ehTarefa)),
  });
}

const COR: Record<SituacaoDoPrazo, string> = {
  atrasada: "text-destructive",
  hoje: "text-[var(--aviso)]",
  futura: "text-muted-foreground",
  sem_prazo: "text-muted-foreground",
  feita: "text-muted-foreground",
};

/**
 * Lista e cria tarefas de um lead. Responsável padrão: quem está criando. O aviso no sino chega ao
 * responsável quando a tarefa é de outra pessoa e quando vence (feito no banco).
 */
export function TarefasDoLead({
  leadId,
  companyId,
  somenteLeitura = false,
}: {
  leadId: string;
  companyId: string;
  somenteLeitura?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const tarefas = useTarefasDoLead(leadId);
  // O rótulo do prazo ("em 2 min" → "há 1 min") depende da hora: relê a cada 30 s.
  const [, setTique] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTique((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const equipe = useQuery({
    queryKey: ["equipe", companyId],
    enabled: Boolean(companyId) && !somenteLeitura,
    queryFn: () => listarMembrosDaEquipe(companyId),
  });

  const [texto, setTexto] = useState("");
  const [prazoId, setPrazoId] = useState<string>("amanha");
  const [outroPrazo, setOutroPrazo] = useState("");
  const [responsavel, setResponsavel] = useState<string>("");
  const [mostrarFeitas, setMostrarFeitas] = useState(false);

  const rapidos = useMemo(() => prazosRapidos(), []);
  const lista = tarefas.data ?? [];
  const abertas = lista.filter((t) => !t.done);
  const feitas = lista.filter((t) => t.done);
  const nomes = new Map((equipe.data ?? []).map((m) => [m.userId, m.nome]));
  const eu = user?.id ?? "";
  const responsavelEfetivo = responsavel || eu;

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["lead-notes", leadId] });
    void qc.invalidateQueries({ queryKey: ["tarefas"] });
  };

  const criar = useMutation({
    mutationFn: () => {
      const quando =
        prazoId === "outro"
          ? outroPrazo
            ? new Date(outroPrazo)
            : null
          : (rapidos.find((p) => p.id === prazoId)?.quando ?? null);
      if (!quando || Number.isNaN(quando.getTime())) throw new Error("Escolha o prazo da tarefa.");
      return createLeadNote({
        companyId,
        leadId,
        body: texto,
        scheduledFor: quando.toISOString(),
        authorId: user?.id ?? null,
        authorName: (user as { email?: string } | null)?.email ?? null,
        assignedTo: responsavelEfetivo || null,
      });
    },
    onSuccess: () => {
      setTexto("");
      setOutroPrazo("");
      recarregar();
      toast.success("Tarefa criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const concluir = useMutation({
    mutationFn: (v: { id: string; done: boolean }) => toggleNoteDone(v.id, v.done),
    onSuccess: recarregar,
    onError: (e: Error) => toast.error(e.message),
  });

  const linha = (t: (typeof lista)[number]) => {
    const prazo = rotuloDoPrazo(t);
    const dono = t.assigned_to && t.assigned_to !== eu ? nomes.get(t.assigned_to) : null;
    return (
      <li key={t.id} className="flex items-start gap-2.5 py-2">
        <button
          type="button"
          disabled={somenteLeitura || concluir.isPending}
          onClick={() => concluir.mutate({ id: t.id, done: !t.done })}
          aria-label={t.done ? `Reabrir "${t.body}"` : `Marcar "${t.body}" como feita`}
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors max-sm:h-7 max-sm:w-7",
            t.done
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background hover:border-primary",
          )}
        >
          {t.done && <Check className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm leading-snug", t.done && "text-muted-foreground line-through")}>
            {t.body}
          </p>
          <p className="text-xs">
            <span className={COR[prazo.situacao]}>{t.done ? "feita" : prazo.texto}</span>
            {dono && <span className="text-muted-foreground"> · {dono}</span>}
          </p>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-3">
      {!somenteLeitura && (
        <div className="space-y-2">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && texto.trim() && !criar.isPending) {
                e.preventDefault();
                criar.mutate();
              }
            }}
            placeholder="Nova tarefa. Ex.: ligar para confirmar a visita"
            className="h-9 text-sm max-sm:h-11"
            aria-label="Nova tarefa"
          />
          <div className="flex flex-wrap gap-1.5">
            {[
              ...rapidos.map((p) => ({ id: p.id, rotulo: p.rotulo })),
              { id: "outro", rotulo: "Outro horário" },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPrazoId(p.id)}
                aria-pressed={prazoId === p.id}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors max-sm:min-h-10 max-sm:px-3.5",
                  prazoId === p.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
          {prazoId === "outro" && (
            <Input
              type="datetime-local"
              value={outroPrazo}
              onChange={(e) => setOutroPrazo(e.target.value)}
              className="h-9 max-sm:h-11"
              aria-label="Data e hora da tarefa"
            />
          )}
          <div className="flex gap-2">
            <Select value={responsavelEfetivo} onValueChange={setResponsavel}>
              <SelectTrigger
                className="h-9 min-w-0 flex-1 text-xs max-sm:h-11"
                aria-label="Responsável"
              >
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                {(equipe.data ?? []).map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.userId === eu ? `${m.nome} (eu)` : m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="h-9 max-sm:h-11"
              disabled={!texto.trim() || criar.isPending}
              onClick={() => criar.mutate()}
            >
              {criar.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-1">Criar</span>
            </Button>
          </div>
        </div>
      )}

      {tarefas.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : abertas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma tarefa em aberto.</p>
      ) : (
        <ul className="divide-y">{abertas.map(linha)}</ul>
      )}

      {feitas.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setMostrarFeitas((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", mostrarFeitas && "rotate-180")}
            />
            Feitas ({feitas.length})
          </button>
          {mostrarFeitas && <ul className="divide-y">{feitas.map(linha)}</ul>}
        </div>
      )}
    </div>
  );
}

/** "3" e, quando há atraso, "3 · 1 atrasada": o resumo da seção fechada. */
export function resumoDasTarefas(
  lista: ReadonlyArray<{ done: boolean; scheduled_for: string | null }>,
): string | null {
  const { abertas, atrasadas } = contarAbertas(lista);
  if (abertas === 0) return null;
  return atrasadas > 0
    ? `${abertas} · ${atrasadas} atrasada${atrasadas > 1 ? "s" : ""}`
    : String(abertas);
}
