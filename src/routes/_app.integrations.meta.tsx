import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2, Loader2, ExternalLink, Power, PowerOff, CheckCircle2, AlertCircle, RefreshCw, FileText, DownloadCloud, History, Settings, LayoutGrid, Database, Zap, ChevronRight, Search, Filter, Eye, X } from "lucide-react";
import { toast } from "sonner";
import {
  startMetaOAuth,
  getMetaConnection,
  setPageSubscription,
  disconnectMeta,
} from "@/lib/meta-oauth.functions";
import { syncMetaLeadForms, listMetaForms, importMetaFormLeads, listMetaImportJobs, retryMetaImportJob } from "@/lib/meta-forms.functions";
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
} from "@/components/ui/dialog";



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
  const retryJob = useServerFn(retryMetaImportJob);

  const [drawerForm, setDrawerForm] = useState<MetaFormForMapping | null>(null);
  const [importOptions, setImportOptions] = useState<Record<string, ImportOptions>>({});
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFormId, setPreviewFormId] = useState<string | null>(null);



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

  const disconnectMutation = useMutation({
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
    onSuccess: (res) => {
      toast.success(`${res.forms_synced} formulário(s) sincronizado(s)`);
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

  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const params = await retryJob({ data: { jobId } });
      return importLeads({
        data: {
          formId: params.form_id,
          since: params.since,
          until: params.until,
          limit: 200,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(
        `Retentativa concluída: ${res.total_imported} novo(s), ${res.total_duplicates} duplicado(s), ${res.total_failed} falha(s).`,
      );
      qc.invalidateQueries({ queryKey: ["meta-import-jobs"] });
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

  const filteredForms = (formsQuery.data?.forms ?? []).filter((f: any) => {
    const matchesPage = pageFilter === "all" || f.page_id === pageFilter;
    const matchesSearch =
      f.form_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.form_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (f.page_name || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesPage && matchesSearch;
  });


  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center justify-between gap-6"
      >
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">
            <Zap className="h-3 w-3 fill-primary" />
            Integrations Hub
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center gap-3 text-foreground">
            Meta Lead Ads
          </h1>
          <p className="text-muted-foreground max-w-2xl text-base md:text-lg leading-relaxed">
            Sincronização inteligente de leads, roteamento automático e integração profunda com CV.CRM.
          </p>
        </div>
      </motion.div>


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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                    Conectado como {connection.meta_user_name}
                  </CardTitle>
                  <CardDescription>
                    Status: <Badge variant="secondary">{connection.status}</Badge>
                    {daysLeft != null && (
                      <span className="ml-2">
                        Token expira em <strong>{daysLeft} dias</strong>
                      </span>
                    )}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  <PowerOff className="w-4 h-4 mr-2" />
                  Desconectar
                </Button>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Páginas ({pages.length})</CardTitle>
              <CardDescription>
                Ative o recebimento de leads em cada página. A assinatura garante a entrega em tempo real via webhook.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma página encontrada.</p>
              ) : (
                <div className="divide-y">
                  {pages.map((p) => (
                    <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between py-4 gap-4">
                      <div className="space-y-1">
                        <div className="font-bold text-foreground flex items-center gap-2">
                          {p.page_name}
                          {p.subscribed && (
                            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded w-fit">
                          ID: {p.page_id}
                          {p.category && ` · ${p.category}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {p.subscribed ? (
                          <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600 font-bold">
                            <Power className="w-3 h-3 mr-1" />
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="font-bold">Inativo</Badge>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => syncFormsMutation.mutate(p.page_id)}
                            disabled={syncFormsMutation.isPending && syncFormsMutation.variables === p.page_id}
                            className="h-9 px-4 font-bold border-primary/20 hover:border-primary/50 text-primary"
                          >
                            {syncFormsMutation.isPending && syncFormsMutation.variables === p.page_id ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4 mr-2" />
                            )}
                            Sincronizar formulários
                          </Button>
                          <Switch
                            checked={p.subscribed}
                            onCheckedChange={(checked) =>
                              subMutation.mutate({ pageId: p.page_id, subscribe: checked })
                            }
                            disabled={subMutation.isPending}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-2 border-primary/5 shadow-sm overflow-hidden">
            <CardHeader className="bg-muted/30 pb-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <LayoutGrid className="w-5 h-5 text-primary" />
                    Formulários Conectados
                  </CardTitle>
                  <CardDescription>
                    Gerencie os formulários que estão ativos e sincronizando leads para seu pipeline.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                    Sincronizar Todos
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
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="text-left py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Formulário / Página</th>
                        <th className="text-left py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Status Meta</th>
                        <th className="text-right py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Leads</th>
                        <th className="text-left py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Configuração</th>
                        <th className="text-left py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Importação Retroativa</th>
                        <th className="text-right py-4 px-6 font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Ações</th>
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
                            className="hover:bg-primary/[0.02] transition-colors group"
                          >
                            <td className="py-4 px-6">
                              <div className="font-bold text-foreground group-hover:text-primary transition-colors">{f.form_name}</div>
                              <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <Badge variant="outline" className="text-[9px] px-1 h-3.5 uppercase font-medium">{f.page_name ?? "Página Desconhecida"}</Badge>
                                <span className="opacity-40">|</span>
                                <span className="font-mono">ID: {f.form_id}</span>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <Badge 
                                variant={f.status === "ACTIVE" ? "default" : "secondary"} 
                                className={`font-bold text-[10px] ${f.status === 'ACTIVE' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}`}
                              >
                                {f.status ?? "INATIVO"}
                              </Badge>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="font-black text-base tabular-nums">{f.leads_count ?? 0}</div>
                              <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter">Total no Meta</div>
                            </td>
                            <td className="py-4 px-6">
                              {mapping ? (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full ${mapping.is_active ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-300'}`} />
                                    <span className="text-xs font-bold">{mapping.is_active ? "Ativo" : "Pausado"}</span>
                                  </div>
                                  {mapping.external_crm_enabled && (
                                    <Badge variant="secondary" className="text-[10px] font-bold bg-primary/10 text-primary border-primary/10 hover:bg-primary/20">
                                      <Database className="w-3 h-3 mr-1" />
                                      {mapping.external_crm_provider ?? "CRM"}
                                    </Badge>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-muted-foreground/60">
                                  <Settings className="w-3.5 h-3.5" />
                                  <span className="text-[10px] font-bold uppercase">Não Configurado</span>
                                </div>
                              )}
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex flex-col gap-2 min-w-[200px]">
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="date"
                                    value={options.since}
                                    onChange={(event) => updateImportOption(f.form_id, { since: event.target.value })}
                                    className="h-7 text-[10px] px-2 border-primary/10"
                                  />
                                  <span className="text-muted-foreground text-xs font-bold">/</span>
                                  <Input
                                    type="date"
                                    value={options.until}
                                    onChange={(event) => updateImportOption(f.form_id, { until: event.target.value })}
                                    className="h-7 text-[10px] px-2 border-primary/10"
                                  />
                                </div>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 text-[10px] font-bold gap-1.5"
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
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <DownloadCloud className="w-3 h-3" />
                                  )}
                                  Importar Dados
                                </Button>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 px-3 font-bold text-muted-foreground hover:text-primary"
                                  onClick={() => setPreviewFormId(f.form_id)}
                                >
                                  <Eye className="w-4 h-4" />
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



          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Histórico de importações
              </CardTitle>
              <CardDescription>
                Últimas execuções retroativas de leads Meta, com contagem de importados, duplicados e falhas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {jobsQuery.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma importação retroativa executada ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground border-b">
                      <tr>
                        <th className="text-left py-2 pr-2">Status</th>
                        <th className="text-left py-2 pr-2">Formulário</th>
                        <th className="text-left py-2 pr-2">Período</th>
                        <th className="text-right py-2 pr-2">Encontrados</th>
                        <th className="text-right py-2 pr-2">Importados</th>
                        <th className="text-right py-2 pr-2">Duplicados</th>
                        <th className="text-right py-2 pr-2">Falhas</th>
                        <th className="text-left py-2">Finalizado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {jobs.map((job) => (
                        <tr key={job.id}>
                          <td className="py-2 pr-2">
                            <Badge
                              variant={
                                job.status === "completed" || job.status === "completed_with_errors"
                                  ? "default"
                                  : job.status === "failed"
                                    ? "destructive"
                                    : "outline"
                              }
                            >
                              {job.status}
                            </Badge>
                            {job.error_message && (
                              <div className="mt-1 max-w-xs text-xs text-destructive">{job.error_message}</div>
                            )}
                            {(job.status === "failed" || job.status === "completed_with_errors") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-1 h-6 px-2 text-xs"
                                onClick={() => retryMutation.mutate(job.id)}
                                disabled={retryMutation.isPending}
                              >
                                {retryMutation.isPending ? (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3 mr-1" />
                                )}
                                Repetir
                              </Button>
                            )}
                          </td>
                          <td className="py-2 pr-2">
                            <div className="font-medium">{job.form_id}</div>
                            <div className="text-xs text-muted-foreground">Página {job.page_id ?? "—"}</div>
                          </td>
                          <td className="py-2 pr-2 text-xs text-muted-foreground">
                            {job.since ? new Date(job.since).toLocaleDateString("pt-BR") : "início"} →{" "}
                            {job.until ? new Date(job.until).toLocaleDateString("pt-BR") : "agora"}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">{job.total_found}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{job.total_imported}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{job.total_duplicates}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{job.total_failed}</td>
                          <td className="py-2 text-xs text-muted-foreground">
                            {job.finished_at ? new Date(job.finished_at).toLocaleString("pt-BR") : "em andamento"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>


          <Card>
            <CardHeader>
              <CardTitle>Eventos recentes</CardTitle>
              <CardDescription>Últimos leads recebidos via webhook do Meta.</CardDescription>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum evento ainda.</p>
              ) : (
                <div className="space-y-2">
                  {events.map((e) => (
                    <div key={e.id} className="flex items-start gap-3 p-3 rounded-md border bg-card">
                      <div className="mt-0.5">
                        {e.status === "processed" ? (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        ) : e.status === "failed" ? (
                          <AlertCircle className="w-4 h-4 text-destructive" />
                        ) : (
                          <Loader2 className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">Lead {e.leadgen_id}</span>
                          <Badge variant="outline" className="text-xs">
                            {e.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Página {e.page_id} · {new Date(e.received_at).toLocaleString("pt-BR")}
                        </div>
                        {e.error_message && (
                          <div className="text-xs text-destructive mt-1">{e.error_message}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card className="bg-gradient-to-r from-slate-900 to-slate-800 text-slate-100 overflow-hidden border-0">
        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10" />
        <CardHeader className="relative z-10">
          <CardTitle className="text-xl flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" /> Configuração do Webhook
          </CardTitle>
        </CardHeader>
        <CardContent className="relative z-10 space-y-4 text-sm">
          <p className="text-slate-300">
            Configure seu App no <strong className="text-white">Facebook Developers</strong> para disparar leads para:
          </p>
          <div className="font-mono text-[11px] bg-black/40 p-4 rounded-lg border border-white/10 space-y-2">
            <div className="flex flex-col gap-1">
              <span className="text-slate-400 uppercase text-[10px] font-bold">Callback URL:</span>
              <code className="text-green-400">{window.location.origin}/api/public/meta-webhook</code>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-slate-400 uppercase text-[10px] font-bold">Verify Token:</span>
              <span className="text-white">definido via <code>META_VERIFY_TOKEN</code> no backend</span>
            </div>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );


}

export const Route = createFileRoute("/_app/integrations/meta")({
  component: MetaIntegrationsPage,
});
