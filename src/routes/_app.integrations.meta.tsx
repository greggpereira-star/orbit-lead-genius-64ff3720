import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  Link2, Loader2, ExternalLink, Power, PowerOff, CheckCircle2, 
  AlertCircle, RefreshCw, FileText, DownloadCloud, History, 
  Settings, LayoutGrid, Database, Zap, ChevronRight, Search, 
  Filter, Eye, X, Globe, Trash2, CheckSquare
} from "lucide-react";
import { toast } from "sonner";
import {
  startMetaOAuth,
  getMetaConnection,
  setPageSubscription,
  disconnectMeta,
} from "@/lib/meta-oauth.functions";
import { 
  syncMetaLeadForms, 
  listMetaForms, 
  importMetaFormLeads, 
  listMetaImportJobs, 
  deactivateMetaForm,
  bulkDeactivateMetaForms,
  reactivateMetaForm,
  bulkReactivateMetaForms,
  bulkSetMetaFormStage
} from "@/lib/meta-forms.functions";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { StageSelect } from "@/modules/crm/components/StageSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  MetaFormMappingDrawer,
  type MetaFormForMapping,
} from "@/modules/integrations/components/MetaFormMappingDrawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";



interface PageRow {
  id: string;
  page_id: string;
  page_name: string;
  category: string | null;
  subscribed: boolean;
}

interface EventRow {
  id: string;
  leadgen_id: string;
  page_id: string;
  form_id: string | null;
  status: string;
  received_at: string;
  error_message: string | null;
  lead_id: string | null;
}

interface ConnectionRow {
  meta_user_name: string | null;
  status: string;
  token_expires_at: string | null;
  granted_scopes: string[];
}

interface ImportJobRow {
  id: string;
  form_id: string;
  page_id: string | null;
  status: string;
  since: string | null;
  until: string | null;
  started_at: string | null;
  finished_at: string | null;
  total_found: number;
  total_imported: number;
  total_duplicates: number;
  total_failed: number;
  error_message: string | null;
  trace_id: string | null;
  created_at: string;
}

interface ImportOptions {
  since: string;
  until: string;
  limit: number;
}

const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  since: "",
  until: "",
  limit: 200,
};

// "há 3 min" comunica saúde da integração melhor que um timestamp absoluto —
// o usuário quer saber se está fluindo agora, não a data exata.
function formatRelative(date: Date | null): string {
  if (!date) return "nunca";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  return date.toLocaleDateString("pt-BR");
}

function MetaIntegrationsPage() {
  const qc = useQueryClient();
  const start = useServerFn(startMetaOAuth);
  const getConn = useServerFn(getMetaConnection);
  const setSub = useServerFn(setPageSubscription);
  const disconnect = useServerFn(disconnectMeta);
  const syncForms = useServerFn(syncMetaLeadForms);
  const listForms = useServerFn(listMetaForms);
  const importLeads = useServerFn(importMetaFormLeads);
  const listImportJobs = useServerFn(listMetaImportJobs);
  const deactivateForm = useServerFn(deactivateMetaForm);
  const bulkDeactivate = useServerFn(bulkDeactivateMetaForms);
  const reactivate = useServerFn(reactivateMetaForm);
  const bulkReactivate = useServerFn(bulkReactivateMetaForms);
  const bulkSetStage = useServerFn(bulkSetMetaFormStage);
  const { company } = useAuth();


  const [drawerForm, setDrawerForm] = useState<MetaFormForMapping | null>(null);
  const [importOptions, setImportOptions] = useState<Record<string, ImportOptions>>({});
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFormId, setPreviewFormId] = useState<string | null>(null);
  const [selectedFormIds, setSelectedFormIds] = useState<string[]>([]);
  const [bulkImportRange, setBulkImportRange] = useState<{ since: string; until: string }>({ since: "", until: "" });
  /* Etapa aplicada aos formulários selecionados. `null` = etapa padrão do
     funil, que é o comportamento de quem nunca escolheu nada. */
  const [bulkStageId, setBulkStageId] = useState<string | null>(null);
  const [formToDelete, setFormToDelete] = useState<string | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);




  const { data, isLoading } = useQuery({
    queryKey: ["meta-connection"],
    queryFn: () => getConn(),
    staleTime: 30_000,
  });

  const startMutation = useMutation({
    mutationFn: () => start({ data: { origin: window.location.origin } }),
    onSuccess: (res) => {
      if (!res?.authorizeUrl) {
        console.error("[meta-oauth] resposta inválida do servidor", res);
        toast.error("Não foi possível iniciar a conexão com o Meta. Verifique as credenciais no backend (META_APP_ID, META_APP_SECRET, META_OAUTH_STATE_SECRET).");
        return;
      }
      window.location.href = res.authorizeUrl;
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const subMutation = useMutation({
    mutationFn: (input: { pageId: string; subscribe: boolean }) => setSub({ data: input }),
    onSuccess: () => {
      toast.success("Assinatura atualizada");
      qc.invalidateQueries({ queryKey: ["meta-connection"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const disstartMutation = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: () => {
      toast.success("Conta Meta desconectada");
      qc.invalidateQueries({ queryKey: ["meta-connection"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const formsQuery = useQuery({
    queryKey: ["meta-forms"],
    queryFn: () => listForms(),
    staleTime: 30_000,
  });

  const jobsQuery = useQuery({
    queryKey: ["meta-import-jobs"],
    queryFn: () => listImportJobs(),
    staleTime: 15_000,
  });

  const syncFormsMutation = useMutation({
    mutationFn: (pageId: string) => syncForms({ data: { pageId } }),
    onSuccess: (res, pageId) => {
      // "Sincronizado" dizia só o total que existe no Facebook, e a tabela
      // logo abaixo mostra só os ativos. Quem tinha 4 na página e 2 ligados
      // lia "4 sincronizados" e concluía que a seleção não pegou. Sincronizar
      // atualiza todos de propósito — é assim que dá pra ligar outro depois —
      // então o que faltava era a frase separar as duas contagens.
      const ativos = ((formsQuery.data?.forms ?? []) as Array<{ page_id: string; is_active: boolean }>)
        .filter((f) => f.page_id === pageId && f.is_active).length;
      toast.success(
        `${res.forms_synced} formulário(s) na página`,
        { description: `${ativos} ativo(s) recebendo leads. Os outros ficam disponíveis para ligar.` },
      );
      qc.invalidateQueries({ queryKey: ["meta-forms"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const importMutation = useMutation({
    mutationFn: (input: { formId: string; since: string | null; until: string | null; limit: number }) =>
      importLeads({ data: input }),
    onSuccess: (res) => {
      toast.success(
        `Importação concluída: ${res.total_imported} novo(s), ${res.total_duplicates} duplicado(s), ${res.total_failed} falha(s).`,
      );
      qc.invalidateQueries({ queryKey: ["meta-import-jobs"] });
      qc.invalidateQueries({ queryKey: ["meta-connection"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deactivateMutation = useMutation({
    mutationFn: (formId: string) => deactivateForm({ data: { formId } }),
    onSuccess: (_, formId) => {
      toast.success("Formulário removido", {
        action: {
          label: "Desfazer",
          onClick: () => reactivateMutation.mutate(formId)
        }
      });
      qc.invalidateQueries({ queryKey: ["meta-forms"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const reactivateMutation = useMutation({
    mutationFn: (formId: string) => reactivate({ data: { formId } }),
    onSuccess: () => {
      toast.success("Formulário restaurado");
      qc.invalidateQueries({ queryKey: ["meta-forms"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkDeactivateMutation = useMutation({
    mutationFn: (formIds: string[]) => bulkDeactivate({ data: { formIds } }),
    onSuccess: (_, formIds) => {
      toast.success(`${formIds.length} formulários removidos`, {
        action: {
          label: "Desfazer",
          onClick: () => bulkReactivateMutation.mutate(formIds)
        }
      });
      setSelectedFormIds([]);
      qc.invalidateQueries({ queryKey: ["meta-forms"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const bulkReactivateMutation = useMutation({
    mutationFn: (formIds: string[]) => bulkReactivate({ data: { formIds } }),
    onSuccess: () => {
      toast.success("Formulários restaurados");
      qc.invalidateQueries({ queryKey: ["meta-forms"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Importa vários formulários de uma vez com a mesma data — hoje o botão
  // "Importar Dados" só existe por linha; isso conecta a seleção via checkbox
  // (que antes só alimentava "Remover Selecionados") a uma importação de verdade.
  // Sequencial (não Promise.all) pra não disparar N chamadas simultâneas contra a
  // Graph API do Meta de uma vez só.
  /**
   * Grava a etapa de entrada nos formulários selecionados.
   *
   * Endpoint próprio, e não o `saveMetaFormMapping`: aquele é upsert do
   * mapeamento inteiro e zeraria tags, score e regras de qualificação de cada
   * formulário só pra mudar a etapa.
   */
  const bulkStageMutation = useMutation({
    mutationFn: async (stageId: string | null) => {
      const selected = (formsQuery.data?.forms ?? [])
        .filter((f: any) => selectedFormIds.includes(f.form_id))
        .map((f: any) => ({ form_id: f.form_id, page_id: f.page_id }));
      if (!selected.length) return { count: 0 };
      return bulkSetStage({ data: { forms: selected, stage_id: stageId } });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["meta-forms"] });
      const n = (res as { count?: number }).count ?? 0;
      toast.success(
        n === 1 ? 'Etapa definida para 1 formulário' : `Etapa definida para ${n} formulários`,
        { description: 'Vale para os próximos leads e para o que você importar agora.' },
      );
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Não foi possível definir a etapa.');
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (input: { formIds: string[]; since: string | null; until: string | null }) => {
      const results: { formId: string; ok: boolean; error?: string; imported?: number; duplicates?: number; failed?: number }[] = [];
      for (const formId of input.formIds) {
        try {
          const res = await importLeads({
            data: { formId, since: input.since, until: input.until, limit: 200 },
          });
          results.push({ formId, ok: true, imported: res.total_imported, duplicates: res.total_duplicates, failed: res.total_failed });
        } catch (err) {
          results.push({ formId, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      const totalImported = results.reduce((sum, r) => sum + (r.imported ?? 0), 0);
      const totalDuplicates = results.reduce((sum, r) => sum + (r.duplicates ?? 0), 0);
      const failedForms = results.filter((r) => !r.ok);
      if (failedForms.length === 0) {
        toast.success(
          `Importação concluída para ${results.length} formulário(s): ${totalImported} novo(s), ${totalDuplicates} duplicado(s).`,
        );
      } else {
        toast.warning(
          `${results.length - failedForms.length}/${results.length} formulário(s) importado(s) (${totalImported} novo(s)). ${failedForms.length} falharam.`,
        );
      }
      qc.invalidateQueries({ queryKey: ["meta-import-jobs"] });
      qc.invalidateQueries({ queryKey: ["meta-connection"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });


  const connection = data?.connection as ConnectionRow | null;
  const pages = (data?.pages ?? []) as PageRow[];
  const events = (data?.recentEvents ?? []) as EventRow[];
  const jobs = (jobsQuery.data?.jobs ?? []) as ImportJobRow[];

  const daysLeft = connection?.token_expires_at
    ? Math.max(0, Math.round((new Date(connection.token_expires_at).getTime() - Date.now()) / 86_400_000))
    : null;

  const updateImportOption = (formId: string, patch: Partial<ImportOptions>) => {
    setImportOptions((current) => ({
      ...current,
      [formId]: {
        ...(current[formId] ?? DEFAULT_IMPORT_OPTIONS),
        ...patch,
      },
    }));
  };

  const filteredForms = useMemo(() => {
    return (formsQuery.data?.forms ?? [])
      .filter((f: any) => f.is_active)
      .filter((f: any) => {
        const matchesPage = pageFilter === "all" || f.page_id === pageFilter;
        const matchesSearch =
          f.form_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.form_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (f.page_name || "").toLowerCase().includes(searchQuery.toLowerCase());
        return matchesPage && matchesSearch;
      });
  }, [formsQuery.data?.forms, pageFilter, searchQuery]);

  // Condensa o que as listas de "Eventos recentes" e "Histórico de importações"
  // mostravam em log bruto: o usuário só precisa saber se está sincronizando e
  // quando foi a última vez que entrou lead — não a linha a linha de cada evento.
  const syncSummary = useMemo(() => {
    const lastEventAt = events.length ? new Date(events[0].received_at) : null;
    const lastDoneJob = jobs.find(
      (j) => j.status === "completed" || j.status === "completed_with_errors",
    );
    const lastJobAt = lastDoneJob?.finished_at ? new Date(lastDoneJob.finished_at) : null;
    const lastSyncAt =
      lastEventAt && lastJobAt
        ? lastEventAt > lastJobAt
          ? lastEventAt
          : lastJobAt
        : (lastEventAt ?? lastJobAt);

    return {
      lastSyncAt,
      leadsReceived: events.filter((e) => e.status === "processed").length,
      failedEvents: events.filter((e) => e.status !== "processed").length,
      failedJobs: jobs.filter((j) => j.status === "failed").length,
    };
  }, [events, jobs]);

  const unconfiguredCount = useMemo(
    () => filteredForms.filter((f: any) => !f.mapping).length,
    [filteredForms],
  );

  // Um formulário removido some da lista, mas o id continuava preso em
  // selectedFormIds: a barra de ações seguia dizendo "2 selecionado(s)" com
  // nenhuma linha marcada, e ainda ofereceria importar/remover algo que não
  // existe mais. Compara contra todos os ativos (não os filtrados) pra que
  // buscar ou filtrar não descarte a seleção do usuário.
  const activeFormIds = useMemo(
    () =>
      new Set(
        (formsQuery.data?.forms ?? [])
          .filter((f: any) => f.is_active)
          .map((f: any) => f.form_id as string),
      ),
    [formsQuery.data?.forms],
  );

  useEffect(() => {
    setSelectedFormIds((prev) => {
      const next = prev.filter((id) => activeFormIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [activeFormIds]);

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto relative z-0 pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="space-y-1.5">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
            Meta Lead Ads
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Leads dos seus anúncios entram direto no pipeline, com roteamento automático.
          </p>
        </div>
        {connection && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Conta:</span>
            <span className="font-medium">{connection.meta_user_name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => disstartMutation.mutate()}
              disabled={disstartMutation.isPending}
              className="h-8 text-muted-foreground hover:text-destructive"
            >
              {disstartMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <PowerOff className="w-3.5 h-3.5 mr-1.5" />
              )}
              Desconectar
            </Button>
          </div>
        )}
      </motion.div>

      {/* A tela dizia "Ativo" com o token morto havia treze dias. Enquanto a
          conexão estiver revogada isto fica no topo, antes de qualquer número,
          porque todo dado abaixo está congelado no momento em que o acesso caiu. */}
      {connection?.status === "revoked" && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3"
        >
          <PowerOff className="h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-destructive">Acesso ao Facebook perdido</p>
            <p className="text-sm text-muted-foreground">
              Nenhum lead novo está entrando. Reconecte para voltar a receber — os que falharam
              enquanto isso são reprocessados sozinhos.
            </p>
          </div>
          <Button size="sm" onClick={() => startMutation.mutate()} disabled={startMutation.isPending}>
            {startMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Reconectar
          </Button>
        </div>
      )}


      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : !connection ? (
        <Card>
          <CardHeader>
            <CardTitle>Conectar conta Meta</CardTitle>
            <CardDescription>
              Você será redirecionado ao Facebook para autorizar o acesso às suas páginas e formulários de Lead Ads.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              size="lg"
            >
              {startMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 mr-2" />
              )}
              Conectar com Facebook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Painel de status: responde "está entrando lead?" antes de qualquer
              outra coisa, e coloca o controle que muda essa resposta ao lado dela.
              Substitui os antigos cards de conexão, de páginas e as duas listas
              de log (eventos recentes / histórico de importações). */}
          <section className="rounded-xl border bg-card divide-y overflow-hidden">
            {pages.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                Nenhuma página do Facebook encontrada nesta conta.
              </div>
            ) : (
              pages.map((p) => {
                const isToggling = subMutation.isPending && subMutation.variables?.pageId === p.page_id;
                const isSyncing = syncFormsMutation.isPending && syncFormsMutation.variables === p.page_id;
                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-x-6 gap-y-5 p-5 md:p-6"
                  >
                    <div className="flex items-start gap-4 flex-1 min-w-[280px]">
                      <span
                        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          p.subscribed
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {p.subscribed ? (
                          <Zap className="h-5 w-5 fill-current" />
                        ) : (
                          <PowerOff className="h-5 w-5" />
                        )}
                      </span>
                      <div className="space-y-1">
                        <h2 className="font-semibold leading-tight">
                          {p.subscribed
                            ? "Recebendo leads automaticamente"
                            : "Recebimento automático desligado"}
                        </h2>
                        <p className="text-sm text-muted-foreground">
                          {p.subscribed ? (
                            <>
                              Todo lead de <span className="font-medium text-foreground">{p.page_name}</span> entra
                              no pipeline em segundos.
                            </>
                          ) : (
                            <>
                              Leads de <span className="font-medium text-foreground">{p.page_name}</span> só entram
                              se você importar manualmente.
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 ml-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncFormsMutation.mutate(p.page_id)}
                        disabled={isSyncing}
                        className="h-9"
                      >
                        {isSyncing ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4 mr-2" />
                        )}
                        Buscar formulários
                      </Button>

                      {/* Rótulo associado ao switch: aumenta a área clicável e
                          nomeia o que o controle faz, em vez de um switch mudo. */}
                      <div className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2">
                        <Label
                          htmlFor={`webhook-${p.page_id}`}
                          className="cursor-pointer select-none text-sm font-medium"
                        >
                          {p.subscribed ? "Ativo" : "Inativo"}
                        </Label>
                        {isToggling ? (
                          <span className="flex h-5 w-9 items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          </span>
                        ) : (
                          <Switch
                            id={`webhook-${p.page_id}`}
                            checked={p.subscribed}
                            onCheckedChange={(checked) =>
                              subMutation.mutate({ pageId: p.page_id, subscribe: checked })
                            }
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Rodapé de saúde: o "minimalista" que substitui as listas de log. */}
            <div className="flex flex-wrap items-center gap-x-8 gap-y-3 bg-muted/40 px-5 py-3.5 md:px-6 text-sm">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Última sincronização:</span>
                <span className="font-medium">{formatRelative(syncSummary.lastSyncAt)}</span>
              </span>
              <span className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Leads recebidos:</span>
                <span className="font-medium tabular-nums">{syncSummary.leadsReceived}</span>
              </span>
              {daysLeft != null && (
                <span className="flex items-center gap-2">
                  {daysLeft <= 7 ? (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-muted-foreground">Acesso expira em:</span>
                  <span className={`font-medium ${daysLeft <= 7 ? "text-destructive" : ""}`}>
                    {daysLeft} dias
                  </span>
                </span>
              )}
              {(syncSummary.failedEvents > 0 || syncSummary.failedJobs > 0) && (
                <span className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">
                    {syncSummary.failedEvents + syncSummary.failedJobs} com falha
                  </span>
                  <span className="text-muted-foreground">
                    — serão reprocessados automaticamente
                  </span>
                </span>
              )}
            </div>
          </section>

          <Card className="overflow-hidden">
            <CardHeader className="pb-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <LayoutGrid className="w-4.5 h-4.5 text-muted-foreground" />
                    Formulários
                    {unconfiguredCount > 0 && (
                      <Badge variant="outline" className="ml-1 border-amber-500/40 text-amber-600 dark:text-amber-400 font-normal">
                        {unconfiguredCount} sem configuração
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {unconfiguredCount > 0
                      ? "Formulários sem configuração recebem leads, mas não têm etapa do pipeline definida."
                      : "Formulários que alimentam seu pipeline."}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="default" size="sm" className="font-bold h-9">
                        <Link2 className="w-4 h-4 mr-2" />
                        Conectar Novos Formulários
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[600px]">
                      <DialogHeader>
                        <DialogTitle>Conectar Formulários Meta</DialogTitle>
                        <DialogDescription>
                          Selecione quais formulários você deseja importar para o sistema.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="bg-muted/50 p-4 rounded-lg text-sm flex items-start gap-3 border border-primary/10">
                          <Zap className="w-5 h-5 text-primary mt-0.5" />
                          <div>
                            <p className="font-bold text-foreground">Importação Inteligente</p>
                            <p className="text-muted-foreground">Apenas os formulários selecionados serão exibidos na tabela principal, mantendo sua área de trabalho limpa.</p>
                          </div>
                        </div>
                        
                        <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2">
                          {pages.map(page => (
                            <div key={page.page_id} className="space-y-2">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2 px-1">
                                <Globe className="w-3 h-3" />
                                {page.page_name}
                              </h4>
                              {formsQuery.data?.forms
                                .filter((f: any) => f.page_id === page.page_id && !f.is_active)
                                .map((f: any) => (
                                  <div key={f.form_id} className="flex items-center justify-between p-3 rounded-md border bg-card hover:bg-accent/5 transition-colors">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium">{f.form_name}</span>
                                      <span className="text-[10px] text-muted-foreground">ID: {f.form_id}</span>
                                    </div>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      className="h-8 text-xs font-bold relative z-50 pointer-events-auto"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDrawerForm({
                                          form_id: f.form_id,
                                          form_name: f.form_name,
                                          page_id: f.page_id,
                                          page_name: page.page_name,
                                          mapping: { is_active: true } as any
                                        });
                                      }}
                                    >
                                      Conectar

                                    </Button>
                                  </div>
                                ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                   <Button 
                    variant="outline" 
                    size="sm" 
                    className="font-bold border-primary/20 h-9"
                    onClick={() => {
                      const firstPage = pages[0];
                      if (firstPage) {
                        syncFormsMutation.mutate(firstPage.page_id);
                      } else {
                        toast.error("Nenhuma página encontrada para sincronizar.");
                      }
                    }}
                    disabled={syncFormsMutation.isPending}
                  >
                    {syncFormsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Sincronizar Tudo
                  </Button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input 
                    placeholder="Buscar formulário, ID ou página..." 
                    className="pl-10 h-10 border-primary/10 bg-background/50 focus:bg-background"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 sm:w-64">
                  <div className="relative w-full">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Select value={pageFilter} onValueChange={setPageFilter}>
                      <SelectTrigger className="pl-10 h-10 border-primary/10 bg-background/50 focus:bg-background">
                        <SelectValue placeholder="Filtrar por Página" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as Páginas</SelectItem>
                        {pages.map(p => (
                          <SelectItem key={p.page_id} value={p.page_id}>{p.page_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {formsQuery.isLoading ? (
                <div className="p-8 space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : !formsQuery.data?.forms.length ? (
                <div className="p-12 text-center space-y-4">
                  <div className="mx-auto w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center text-primary/40 mb-4">
                    <FileText className="w-8 h-8" />
                  </div>

                  <h3 className="text-lg font-bold">Nenhum formulário conectado</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Escolha uma página acima e utilize o botão <strong>Sincronizar formulários</strong> para carregar e selecionar quais formulários deseja importar.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <AnimatePresence>
                    {selectedFormIds.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-primary/5 px-6 py-3 flex items-center justify-between border-b border-primary/10"
                      >
                        <div className="flex items-center gap-3">
                          <CheckSquare className="h-4 w-4 text-primary" />
                          <span className="text-sm font-bold text-primary">
                            {selectedFormIds.length} selecionado(s)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Definir a etapa aqui, junto da seleção, evita ter
                              que abrir o mapeamento formulário por formulário
                              depois. Vale pros leads que vierem daqui pra
                              frente E pros que a importação abaixo trouxer —
                              a importação lê a etapa do mapeamento. */}
                          <div className="w-[190px]">
                            <StageSelect
                              companyId={company?.id ?? ''}
                              value={bulkStageId}
                              onChange={(stageId) => {
                                setBulkStageId(stageId);
                                bulkStageMutation.mutate(stageId);
                              }}
                              disabled={bulkStageMutation.isPending}
                            />
                          </div>
                          <Input
                            type="date"
                            value={bulkImportRange.since}
                            onChange={(event) => setBulkImportRange((prev) => ({ ...prev, since: event.target.value }))}
                            className="h-8 text-[11px] px-2 border-primary/10 bg-background"
                            aria-label="Data inicial da importação em massa"
                          />
                          <span className="text-muted-foreground text-xs font-bold">/</span>
                          <Input
                            type="date"
                            value={bulkImportRange.until}
                            onChange={(event) => setBulkImportRange((prev) => ({ ...prev, until: event.target.value }))}
                            className="h-8 text-[11px] px-2 border-primary/10 bg-background"
                            aria-label="Data final da importação em massa"
                          />
                          <Button
                            variant="default"
                            size="sm"
                            className="font-bold h-8"
                            disabled={bulkImportMutation.isPending}
                            onClick={() =>
                              bulkImportMutation.mutate({
                                formIds: selectedFormIds,
                                since: bulkImportRange.since || null,
                                until: bulkImportRange.until || null,
                              })
                            }
                          >
                            {bulkImportMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                            ) : (
                              <DownloadCloud className="h-3.5 w-3.5 mr-2" />
                            )}
                            Importar Selecionados
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="font-bold h-8"
                            onClick={() => setIsBulkDeleteOpen(true)}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Remover Selecionados
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="py-4 px-6 text-left w-10">
                          <Checkbox 
                            checked={filteredForms.length > 0 && selectedFormIds.length === filteredForms.length}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedFormIds(filteredForms.map((f: any) => f.form_id));
                              } else {
                                setSelectedFormIds([]);
                              }
                            }}
                          />
                        </th>
                        <th className="text-left py-3 px-6 font-medium text-xs text-muted-foreground">Formulário</th>
                        <th className="text-left py-3 px-6 font-medium text-xs text-muted-foreground">Status</th>
                        <th className="text-right py-3 px-6 font-medium text-xs text-muted-foreground">Leads</th>
                        <th className="text-right py-3 px-6 font-medium text-xs text-muted-foreground">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredForms.map((f: any) => {
                        const mapping = f.mapping as
                          | {
                              id: string;
                              is_active: boolean;
                              stage_id: string | null;
                              external_crm_enabled: boolean;
                              external_crm_provider: string | null;
                            }
                          | null;
                        const options = importOptions[f.form_id] ?? DEFAULT_IMPORT_OPTIONS;
                        const isImporting = importMutation.isPending && importMutation.variables?.formId === f.form_id;

                        return (
                          <motion.tr 
                            key={f.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`hover:bg-primary/[0.02] transition-colors group ${selectedFormIds.includes(f.form_id) ? 'bg-primary/[0.03]' : ''}`}
                          >
                            <td className="py-4 px-6">
                              <Checkbox 
                                checked={selectedFormIds.includes(f.form_id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedFormIds(prev => [...prev, f.form_id]);
                                  } else {
                                    setSelectedFormIds(prev => prev.filter(id => id !== f.form_id));
                                  }
                                }}
                              />
                            </td>
                            <td className="py-4 px-6">
                              <div className="font-bold text-foreground group-hover:text-primary transition-colors">{f.form_name}</div>
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <Badge variant="outline" className="text-[9px] px-1 h-3.5 uppercase font-medium">{f.page_name ?? "Página Desconhecida"}</Badge>
                                <span className="opacity-40">|</span>
                                <span className="font-mono">ID: {f.form_id}</span>
                              </div>
                            </td>
                            {/* Estado do Meta e estado do roteamento eram duas colunas
                                separadas; o que decide a ação é um só: esse
                                formulário está alimentando o pipeline ou não. */}
                            <td className="py-4 px-6">
                              {!mapping ? (
                                <span className="inline-flex items-center gap-2 text-amber-600 dark:text-amber-400">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                  <span className="text-sm font-medium">Não configurado</span>
                                </span>
                              ) : (
                                <div className="space-y-1.5">
                                  <span className="inline-flex items-center gap-2">
                                    <span
                                      className={`h-2 w-2 rounded-full ${
                                        mapping.is_active ? "bg-emerald-500" : "bg-muted-foreground/40"
                                      }`}
                                    />
                                    <span className="text-sm font-medium">
                                      {mapping.is_active ? "Recebendo" : "Pausado"}
                                    </span>
                                  </span>
                                  {mapping.external_crm_enabled && (
                                    <Badge variant="secondary" className="ml-4 text-[10px]">
                                      <Database className="w-3 h-3 mr-1" />
                                      {mapping.external_crm_provider ?? "CRM"}
                                    </Badge>
                                  )}
                                </div>
                              )}
                              {f.status && f.status !== "ACTIVE" && (
                                <div className="mt-1 text-xs text-muted-foreground">
                                  Arquivado no Meta
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <span className="text-base font-semibold tabular-nums">{f.leads_count ?? 0}</span>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {/* Importação por período vivia numa coluna fixa de
                                    ~250px que forçava scroll horizontal na tabela
                                    inteira; vira um popover sob demanda. */}
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 px-3 text-muted-foreground hover:text-primary"
                                      title="Importar leads de um período"
                                    >
                                      {isImporting ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <DownloadCloud className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent align="end" className="w-72 space-y-3">
                                    <div className="space-y-1">
                                      <h4 className="text-sm font-medium">Importar leads antigos</h4>
                                      <p className="text-xs text-muted-foreground">
                                        Busca leads já existentes no Meta neste período. Deixe em branco
                                        para trazer os mais recentes.
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="date"
                                        value={options.since}
                                        onChange={(event) =>
                                          updateImportOption(f.form_id, { since: event.target.value })
                                        }
                                        className="h-9 text-xs"
                                        aria-label="Data inicial"
                                      />
                                      <span className="text-xs text-muted-foreground">até</span>
                                      <Input
                                        type="date"
                                        value={options.until}
                                        onChange={(event) =>
                                          updateImportOption(f.form_id, { until: event.target.value })
                                        }
                                        className="h-9 text-xs"
                                        aria-label="Data final"
                                      />
                                    </div>
                                    <Button
                                      size="sm"
                                      className="w-full"
                                      onClick={() =>
                                        importMutation.mutate({
                                          formId: f.form_id,
                                          since: options.since || null,
                                          until: options.until || null,
                                          limit: options.limit,
                                        })
                                      }
                                      disabled={isImporting}
                                    >
                                      {isImporting ? (
                                        <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                                      ) : (
                                        <DownloadCloud className="w-3.5 h-3.5 mr-2" />
                                      )}
                                      Importar
                                    </Button>
                                  </PopoverContent>
                                </Popover>

                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 px-3 font-bold text-muted-foreground hover:text-primary"
                                  onClick={() => setPreviewFormId(f.form_id)}
                                  title="Visualizar perguntas"
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 px-3 font-bold text-muted-foreground hover:text-destructive transition-colors"
                                  onClick={() => setFormToDelete(f.form_id)}
                                  title="Desconectar formulário"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>

                                <Button
                                  variant="default"
                                  size="sm"
                                  className="h-9 px-4 font-bold shadow-sm shadow-primary/20"
                                  onClick={() =>
                                    setDrawerForm({
                                      form_id: f.form_id,
                                      form_name: f.form_name,
                                      page_id: f.page_id,
                                      page_name: f.page_name,
                                      mapping: mapping as MetaFormForMapping["mapping"],
                                    })
                                  }
                                >
                                  Configurar
                                  <ChevronRight className="w-4 h-4 ml-1.5" />
                                </Button>
                              </div>
                            </td>

                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

        </>
      )}

      <MetaFormMappingDrawer
        open={drawerForm !== null}
        form={drawerForm}
        onOpenChange={(v) => !v && setDrawerForm(null)}
      />

      {/* Preview Dialog */}
      <Dialog open={!!previewFormId} onOpenChange={(open) => !open && setPreviewFormId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Pré-visualização do Formulário
            </DialogTitle>
            <DialogDescription>
              Campos e perguntas configuradas no formulário do Meta.
            </DialogDescription>
          </DialogHeader>

          {previewFormId && (() => {
            const form = (formsQuery.data?.forms ?? []).find((f: any) => f.form_id === previewFormId);
            if (!form) return <p className="text-center py-8 text-muted-foreground">Formulário não encontrado.</p>;

            const questions = (form.questions ?? []) as Array<{ key: string; label: string; type: string }>;

            return (
              <div className="space-y-6 py-4">
                <div className="p-4 rounded-xl bg-muted/50 space-y-2">
                  <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Nome do Formulário</div>
                  <div className="text-lg font-bold">{form.form_name}</div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">ID: {form.form_id}</div>
                </div>

                <div className="space-y-4">
                  <div className="text-xs font-bold uppercase text-muted-foreground tracking-wider flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    Campos e Perguntas ({questions.length})
                  </div>
                  
                  {questions.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-xl text-muted-foreground">
                      Nenhuma pergunta detectada neste formulário.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {questions.map((q, idx) => (
                        <div key={idx} className="p-4 rounded-xl border bg-card/50 flex items-start gap-4 group hover:border-primary/20 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                            {idx + 1}
                          </div>
                          <div className="space-y-1">
                            <div className="font-bold text-sm">{q.label}</div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[9px] uppercase font-bold py-0 h-4">{q.type}</Badge>
                              <span className="text-[10px] text-muted-foreground font-mono">Key: {q.key}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-4">
                  <Button variant="outline" onClick={() => setPreviewFormId(null)} className="font-bold">
                    Fechar Visualização
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Deletion Dialogs */}
      <AlertDialog open={!!formToDelete} onOpenChange={(open) => !open && setFormToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Formulário?</AlertDialogTitle>
            <AlertDialogDescription>
              Este formulário deixará de ser exibido na tabela e a sincronização de leads para ele será pausada. Você pode reconectá-lo a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
              onClick={() => {
                if (formToDelete) {
                  deactivateMutation.mutate(formToDelete);
                  setFormToDelete(null);
                }
              }}
            >
              Confirmar Remoção
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {selectedFormIds.length} Formulários?</AlertDialogTitle>
            <AlertDialogDescription>
              Os formulários selecionados deixarão de ser exibidos na tabela e a sincronização de leads será pausada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold"
              onClick={() => {
                bulkDeactivateMutation.mutate(selectedFormIds);
                setIsBulkDeleteOpen(false);
              }}
            >
              Remover Selecionados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );


}

export const Route = createFileRoute("/_app/integrations/meta")({
  component: MetaIntegrationsPage,
});
