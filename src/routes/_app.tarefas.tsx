import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toggleNoteDone } from "@/modules/crm/services/leadNotesService";
import { listarMembrosDaEquipe } from "@/modules/crm/services/teamService";
import {
  agruparPorSituacao,
  ordenarTarefas,
  rotuloDoPrazo,
  type Tarefa,
} from "@/modules/crm/lib/tarefas";

export const Route = createFileRoute("/_app/tarefas")({
  head: () => ({ meta: [{ title: "Tarefas — Alt LeadFlow" }] }),
  component: TarefasPage,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Linha = Tarefa & { lead: { id: string; name: string | null } | null };

function TarefasPage() {
  const { company, user } = useAuth();
  const companyId = company?.id;
  const qc = useQueryClient();
  const [quem, setQuem] = useState<"minhas" | "todas">("minhas");
  const [estado, setEstado] = useState<"abertas" | "feitas">("abertas");

  const dados = useQuery({
    queryKey: ["tarefas", companyId],
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<Linha[]> => {
      const { data, error } = await (supabase as any)
        .from("lead_notes")
        .select(
          "id,lead_id,body,scheduled_for,done,done_at,assigned_to,author_id,lead:leads(id,name)",
        )
        .eq("company_id", companyId)
        .not("scheduled_for", "is", null)
        .order("scheduled_for", { ascending: true })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as Linha[];
    },
  });
  const equipe = useQuery({
    queryKey: ["equipe", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listarMembrosDaEquipe(companyId as string),
  });
  const nomes = new Map((equipe.data ?? []).map((m) => [m.userId, m.nome]));

  const concluir = useMutation({
    mutationFn: (v: { id: string; done: boolean }) => toggleNoteDone(v.id, v.done),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tarefas"] });
      void qc.invalidateQueries({ queryKey: ["lead-notes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // "Minhas": as atribuídas a mim e as que criei sem responsável (o aviso de prazo vai para o autor).
  const minhas = (t: Linha) =>
    t.assigned_to === user?.id || (!t.assigned_to && t.author_id === user?.id);
  const filtradas = useMemo(
    () => (dados.data ?? []).filter((t) => quem === "todas" || minhas(t)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dados.data, quem, user?.id],
  );

  const grupos = agruparPorSituacao(filtradas);
  const feitas = ordenarTarefas(filtradas.filter((t) => t.done));
  const totalAbertas = grupos.atrasadas.length + grupos.hoje.length + grupos.proximas.length;

  const linha = (t: Linha) => {
    const prazo = rotuloDoPrazo(t);
    const dono = t.assigned_to ? nomes.get(t.assigned_to) : null;
    return (
      <li key={t.id} className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          disabled={concluir.isPending}
          onClick={() => concluir.mutate({ id: t.id, done: !t.done })}
          aria-label={t.done ? `Reabrir "${t.body}"` : `Marcar "${t.body}" como feita`}
          className={cn(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-colors max-sm:h-8 max-sm:w-8",
            t.done
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background hover:border-primary",
          )}
        >
          {t.done && <Check className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm", t.done && "text-muted-foreground line-through")}>{t.body}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <span
              className={cn(
                !t.done && prazo.situacao === "atrasada" && "font-medium text-destructive",
                !t.done && prazo.situacao === "hoje" && "font-medium text-[var(--aviso)]",
              )}
            >
              {t.done ? "feita" : prazo.texto}
            </span>
            {t.lead && (
              <>
                {" · "}
                <Link
                  to="/leads/$id"
                  params={{ id: t.lead.id }}
                  className="underline-offset-2 hover:underline"
                >
                  {t.lead.name || "Lead sem nome"}
                </Link>
              </>
            )}
            {dono && quem === "todas" && ` · ${dono}`}
          </p>
        </div>
      </li>
    );
  };

  const bloco = (titulo: string, lista: Linha[], destaque?: boolean) =>
    lista.length > 0 && (
      <section className="overflow-hidden rounded-xl border bg-background">
        <h2
          className={cn(
            "border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wide",
            destaque ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {titulo} ({lista.length})
        </h2>
        <ul className="divide-y">{lista.map(linha)}</ul>
      </section>
    );

  if (!companyId) return <p className="p-6 text-sm text-muted-foreground">Carregando…</p>;

  const botao = (ativo: boolean) =>
    cn(
      "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors max-sm:min-h-11",
      ativo
        ? "bg-primary text-primary-foreground"
        : "bg-muted text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <ListChecks className="h-6 w-6" /> Tarefas
        </h1>
        <p className="text-sm text-muted-foreground">
          As tarefas dos seus leads. Crie pela conversa ou pela ficha do lead; o aviso chega no sino
          quando vence.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className={botao(quem === "minhas")} onClick={() => setQuem("minhas")}>
          Minhas
        </button>
        <button className={botao(quem === "todas")} onClick={() => setQuem("todas")}>
          Da equipe
        </button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <button className={botao(estado === "abertas")} onClick={() => setEstado("abertas")}>
          Abertas ({totalAbertas})
        </button>
        <button className={botao(estado === "feitas")} onClick={() => setEstado("feitas")}>
          Feitas ({feitas.length})
        </button>
      </div>

      {dados.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : dados.error ? (
        <p className="text-sm text-destructive">Não consegui carregar as tarefas.</p>
      ) : estado === "abertas" ? (
        totalAbertas === 0 ? (
          <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
            Nenhuma tarefa em aberto.
          </p>
        ) : (
          <div className="space-y-4">
            {bloco("Atrasadas", grupos.atrasadas, true)}
            {bloco("Hoje", grupos.hoje)}
            {bloco("Próximas", grupos.proximas)}
          </div>
        )
      ) : feitas.length === 0 ? (
        <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
          Nenhuma tarefa feita ainda.
        </p>
      ) : (
        bloco("Feitas", feitas.slice().reverse())
      )}
    </div>
  );
}
