import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, RotateCw, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ROTULO_DO_ESTADO,
  avisoDeReenvio,
  destinosDoEnvio,
  explicarFalha,
  podeReenviar,
  resumirEnvios,
  type EnvioDeConversao,
  type ResultadoDoDestino,
} from "@/modules/conversoes/historico";

export const Route = createFileRoute("/_app/settings/envios")({
  head: () => ({ meta: [{ title: "Histórico de envios — Configurações" }] }),
  component: HistoricoDeEnvios,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;
const LIMITE = 200;

type Filtro = "todos" | "failed" | "sent" | "rehearsal" | "pending" | "skipped";

const COR_DO_ESTADO: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  rehearsal: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  pending: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  skipped: "bg-muted text-muted-foreground",
};

const ROTULO_DO_RESULTADO: Record<ResultadoDoDestino, string> = {
  enviado: "enviado",
  ensaio: "ensaio",
  falhou: "falhou",
  pulado: "ignorado",
  nao_configurado: "não usa",
};

const dataHora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "—";

function HistoricoDeEnvios() {
  const { company, membership } = useAuth();
  const companyId = company?.id;
  const ehAdmin = membership?.role === "owner" || membership?.role === "admin";
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberto, setAberto] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<EnvioDeConversao[] | null>(null);

  const q = useQuery({
    queryKey: ["envios-de-conversao", companyId],
    enabled: !!companyId && ehAdmin,
    // Enquanto há algo na fila, a tela acompanha sozinha.
    refetchInterval: (query) =>
      (query.state.data?.envios as EnvioDeConversao[] | undefined)?.some((e) => e.status === "pending")
        ? 10_000
        : false,
    queryFn: async () => {
      const { data, error } = await db
        .from("conversion_dispatches")
        .select(
          "id, lead_id, stage_id, event_id, status, meta_result, google_result, label_result, attempts, reenvios, last_error, occurred_at, dispatched_at, created_at",
        )
        .eq("company_id", companyId)
        .order("occurred_at", { ascending: false })
        .limit(LIMITE);
      if (error) throw error;
      const envios = (data ?? []) as EnvioDeConversao[];

      const leadIds = [...new Set(envios.map((e) => e.lead_id))];
      const etapaIds = [...new Set(envios.map((e) => e.stage_id))];
      const [leads, etapas] = await Promise.all([
        leadIds.length ? db.from("leads").select("id, name").in("id", leadIds) : { data: [] },
        etapaIds.length ? db.from("stages").select("id, name").in("id", etapaIds) : { data: [] },
      ]);
      const nomeDoLead = new Map<string, string>((leads.data ?? []).map((l: any) => [l.id, l.name]));
      const nomeDaEtapa = new Map<string, string>((etapas.data ?? []).map((s: any) => [s.id, s.name]));
      return { envios, nomeDoLead, nomeDaEtapa };
    },
  });

  const reenviar = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await db.rpc("reenviar_conversoes", { p_ids: ids });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (n) => {
      if (n > 0) toast.success(`${n} ${n === 1 ? "conversão voltou" : "conversões voltaram"} para a fila. O envio acontece em alguns minutos.`);
      else toast.message("Nada foi reenviado. Só falhas e ensaios voltam para a fila.");
      setConfirmar(null);
      void qc.invalidateQueries({ queryKey: ["envios-de-conversao", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const envios = q.data?.envios ?? [];
  const resumo = useMemo(() => resumirEnvios(envios), [envios]);
  const visiveis = useMemo(
    () => (filtro === "todos" ? envios : envios.filter((e) => e.status === filtro)),
    [envios, filtro],
  );
  const falhasReenviaveis = useMemo(
    () => envios.filter((e) => e.status === "failed" && destinosDoEnvio(e).some((d) => d.resultado === "falhou" && explicarFalha(d.destino, d.detalhe, e.meta_result).adiantaReenviar)),
    [envios],
  );

  if (!companyId) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  if (!ehAdmin) {
    return (
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Histórico de envios</h2>
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Só dono e administradores veem o histórico de envios à Meta e ao Google.
        </p>
      </div>
    );
  }

  const agora = new Date();
  const abas: Array<{ id: Filtro; rotulo: string; n: number }> = [
    { id: "todos", rotulo: "Todos", n: resumo.total },
    { id: "failed", rotulo: "Falhas", n: resumo.falhas },
    { id: "sent", rotulo: "Enviados", n: resumo.enviados },
    { id: "rehearsal", rotulo: "Ensaio", n: resumo.ensaios },
    { id: "pending", rotulo: "Na fila", n: resumo.naFila },
    { id: "skipped", rotulo: "Ignorados", n: resumo.ignorados },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Send className="h-5 w-5" /> Histórico de envios
          </h2>
          <p className="text-sm text-muted-foreground">
            Cada vez que um lead muda de etapa e a etapa avisa a Meta ou o Google, o resultado fica aqui.
            Mostra os {LIMITE} mais recentes.
          </p>
        </div>
        {falhasReenviaveis.length > 0 && (
          <Button size="sm" onClick={() => setConfirmar(falhasReenviaveis.slice(0, 50))}>
            <RotateCw className="mr-2 h-4 w-4" /> Reenviar {falhasReenviaveis.length} {falhasReenviaveis.length === 1 ? "falha" : "falhas"} que podem passar
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar por estado">
        {abas.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={filtro === a.id}
            onClick={() => setFiltro(a.id)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              filtro === a.id ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {a.rotulo} <span className="tabular-nums">{a.n}</span>
          </button>
        ))}
      </div>

      {resumo.ensaios > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {resumo.ensaios} {resumo.ensaios === 1 ? "envio está" : "envios estão"} em <strong>ensaio</strong>: o conteúdo foi montado, mas nada saiu para a Meta nem para o Google.
          </span>
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : q.error ? (
            <p className="p-6 text-sm text-destructive">Não foi possível carregar o histórico.</p>
          ) : visiveis.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {envios.length === 0
                ? "Nenhum envio ainda. Eles aparecem quando uma etapa com evento da Meta ou do Google recebe um lead."
                : "Nenhum envio neste filtro."}
            </p>
          ) : (
            <ul className="divide-y">
              {visiveis.map((e) => {
                const destinos = destinosDoEnvio(e);
                const expandido = aberto === e.id;
                const falhas = destinos.filter((d) => d.resultado === "falhou");
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setAberto(expandido ? null : e.id)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                      aria-expanded={expandido}
                    >
                      {expandido ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {q.data?.nomeDoLead.get(e.lead_id) ?? "Lead removido"}{" "}
                          <span className="font-normal text-muted-foreground">→ {q.data?.nomeDaEtapa.get(e.stage_id) ?? "etapa removida"}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {dataHora(e.occurred_at)}
                          {e.reenvios > 0 ? ` · reenviado ${e.reenvios}×` : ""}
                        </p>
                      </div>
                      <div className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                        {destinos.map((d) => (
                          <Badge key={d.destino} variant="outline" className="font-normal">
                            {d.destino}: {ROTULO_DO_RESULTADO[d.resultado]}
                          </Badge>
                        ))}
                      </div>
                      <Badge className={`shrink-0 border-0 ${COR_DO_ESTADO[e.status] ?? ""}`}>
                        {ROTULO_DO_ESTADO[e.status] ?? e.status}
                      </Badge>
                    </button>

                    {expandido && (
                      <div className="space-y-3 border-t bg-muted/20 px-4 py-3 text-sm">
                        {falhas.map((d) => {
                          const exp = explicarFalha(d.destino, d.detalhe, e.meta_result);
                          return (
                            <div key={d.destino} className="space-y-1 rounded-lg border bg-background p-3">
                              <p className="font-medium">{d.destino}: {exp.resumo}</p>
                              <p className="text-muted-foreground">{exp.sugestao}</p>
                              {d.detalhe && (
                                <p className="break-words font-mono text-xs text-muted-foreground">Mensagem original: {d.detalhe}</p>
                              )}
                            </div>
                          );
                        })}
                        {falhas.length === 0 && destinos.some((d) => d.resultado === "pulado") && (
                          <p className="text-muted-foreground">{destinos.find((d) => d.resultado === "pulado")?.detalhe ?? "Ignorado."}</p>
                        )}
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                          <div><dt className="font-medium text-foreground">Ocorreu</dt><dd>{dataHora(e.occurred_at)}</dd></div>
                          <div><dt className="font-medium text-foreground">Último envio</dt><dd>{dataHora(e.dispatched_at)}</dd></div>
                          <div><dt className="font-medium text-foreground">Tentativas</dt><dd>{e.attempts}</dd></div>
                          <div><dt className="font-medium text-foreground">Id do evento</dt><dd className="break-all font-mono">{e.event_id}</dd></div>
                        </dl>
                        {podeReenviar(e) && (
                          <Button size="sm" variant="outline" onClick={() => setConfirmar([e])} disabled={reenviar.isPending}>
                            <RotateCw className="mr-2 h-4 w-4" />
                            {e.status === "rehearsal" ? "Enviar de verdade" : "Reenviar"}
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmar !== null} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reenviar {confirmar?.length === 1 ? "esta conversão" : `${confirmar?.length} conversões`}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {confirmar?.length === 1 ? "Ela volta" : "Elas voltam"} para a fila e {confirmar?.length === 1 ? "é enviada" : "são enviadas"} em alguns minutos.
                  Meta e Google reconhecem o mesmo id de evento, então quem já chegou não conta duas vezes.
                </p>
                {(confirmar ?? []).some((e) => e.status === "rehearsal") && (
                  <p className="font-medium text-foreground">
                    Há itens em ensaio. Se o modo de ensaio da empresa ainda estiver ligado, eles voltam a ser só ensaiados.
                  </p>
                )}
                {[...new Set((confirmar ?? []).map((e) => avisoDeReenvio(e, agora)).filter(Boolean))].map((a) => (
                  <p key={a as string} className="text-amber-700 dark:text-amber-300">{a}</p>
                ))}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(ev) => {
                ev.preventDefault();
                if (confirmar) reenviar.mutate(confirmar.map((e) => e.id));
              }}
              disabled={reenviar.isPending}
            >
              {reenviar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reenviar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
