import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  Fingerprint,
  Key,
  LifeBuoy,
  Loader2,
  PlayCircle,
  RefreshCcw,
  Server,
  ShieldCheck,
  User,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/core/auth/hooks/useAuth';
import type { Json } from '@/integrations/supabase/types';
import { supabase } from '@/lib/supabase';
import { reprocessCvcrmDlqEntry } from '@/modules/cvcrm/services/dlq.functions';

export const Route = createFileRoute('/_app/observability')({
  component: ObservabilityPage,
});

interface DlqEntry {
  id: string;
  company_id: string;
  lead_id: string;
  trace_id: string | null;
  delivery_log_id: string | null;
  failure_reason: string | null;
  payload: Json | null;
  last_error: string | null;
  retry_count: number | null;
  created_at: string | null;
  resolved_at: string | null;
}

interface DeliveryLog {
  id: string;
  lead_id: string;
  trace_id: string | null;
  status: string;
  attempt_count: number | null;
  status_code: number | null;
  error_message: string | null;
  cvcrm_lead_id: string | null;
  next_retry_at: string | null;
  sent_at: string | null;
  created_at: string | null;
}

interface SystemLog {
  id: string;
  level: string;
  message: string;
  component: string | null;
  trace_id: string | null;
  created_at: string | null;
}

interface ObservabilityData {
  dlq: DlqEntry[];
  deliveries: DeliveryLog[];
  systemLogs: SystemLog[];
  cvcrmStatus: string;
}

async function fetchObservabilityData(companyId: string): Promise<ObservabilityData> {
  const [dlqResult, deliveryResult, logsResult, cvcrmResult] = await Promise.all([
    supabase
      .from('cvcrm_dead_letter_queue')
      .select('id, company_id, lead_id, trace_id, delivery_log_id, failure_reason, payload, last_error, retry_count, created_at, resolved_at')
      .eq('company_id', companyId)
      .is('resolved_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('cvcrm_delivery_logs')
      .select('id, lead_id, trace_id, status, attempt_count, status_code, error_message, cvcrm_lead_id, next_retry_at, sent_at, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('system_logs')
      .select('id, level, message, component, trace_id, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('cvcrm_integrations')
      .select('connection_status')
      .eq('company_id', companyId)
      .maybeSingle(),
  ]);

  if (dlqResult.error) throw new Error(dlqResult.error.message);
  if (deliveryResult.error) throw new Error(deliveryResult.error.message);
  if (logsResult.error) throw new Error(logsResult.error.message);

  const cvcrmRecord = cvcrmResult.data as { connection_status?: string } | null;

  return {
    dlq: (dlqResult.data ?? []) as DlqEntry[],
    deliveries: (deliveryResult.data ?? []) as DeliveryLog[],
    systemLogs: (logsResult.data ?? []) as SystemLog[],
    cvcrmStatus: cvcrmRecord?.connection_status ?? 'disconnected',
  };
}

function ObservabilityPage() {
  const auth = useAuth();
  const { company } = auth;
  const companyId = company?.id;
  const queryClient = useQueryClient();
  const reprocessDlq = useServerFn(reprocessCvcrmDlqEntry);
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState<string>('all');
  const [selectedDlqEntry, setSelectedDlqEntry] = useState<DlqEntry | null>(null);

  const observabilityQuery = useQuery({
    queryKey: ['observability', companyId],
    queryFn: () => fetchObservabilityData(companyId ?? ''),
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
  });

  const reprocessMutation = useMutation({
    mutationFn: (entry: DlqEntry) => {
      if (!companyId) throw new Error('Workspace não carregado.');
      return reprocessDlq({ data: { dlqId: entry.id, companyId } });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['observability'] });
      if (result.success) {
        toast.success(result.message);
        setSelectedDlqEntry(null);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Falha ao reprocessar item da DLQ.');
    },
  });

  const data = observabilityQuery.data;
  const deliveries = data?.deliveries ?? [];
  const dlq = data?.dlq ?? [];
  const systemLogs = data?.systemLogs ?? [];
  const summary = buildDeliverySummary(deliveries, dlq.length, data?.cvcrmStatus ?? 'disconnected');

  const filteredDeliveries = useMemo(() => {
    if (deliveryStatusFilter === 'all') return deliveries;
    return deliveries.filter((d) => d.status === deliveryStatusFilter);
  }, [deliveries, deliveryStatusFilter]);

  return (
    <div className="space-y-6">

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Observability Center</h1>
          <p className="text-muted-foreground text-sm font-medium">Real-time system health and forensic auth tracking.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => observabilityQuery.refetch()} className="gap-2 font-bold">
            <RefreshCcw className="h-4 w-4" />
            Sync Metrics
          </Button>
        </div>
      </div>

      <Tabs defaultValue="system" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="system">System Health</TabsTrigger>
          <TabsTrigger value="cvcrm">CV.CRM Delivery</TabsTrigger>
          <TabsTrigger value="auth">Auth Forensic</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {summary.map((item) => <HealthCard key={item.label} item={item} isLoading={observabilityQuery.isLoading} />)}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  System Log Stream
                </CardTitle>
              </CardHeader>
              <CardContent>
                <SystemLogTable logs={systemLogs} isLoading={observabilityQuery.isLoading} />
              </CardContent>
            </Card>

            <Card className="border-dashed bg-card shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  DLQ Monitor
                </CardTitle>
                <CardDescription>Falhas definitivas de entrega CV.CRM aguardando análise.</CardDescription>
              </CardHeader>
              <CardContent>
                <DlqSummary dlq={dlq} isLoading={observabilityQuery.isLoading} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cvcrm" className="space-y-6 pt-4">
          {observabilityQuery.error ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Falha ao carregar observabilidade</AlertTitle>
              <AlertDescription>{observabilityQuery.error.message}</AlertDescription>
            </Alert>
          ) : null}

          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-primary" />
                  Entregas CV.CRM
                </CardTitle>
                <CardDescription>Últimas tentativas, retries pendentes e envios concluídos.</CardDescription>
              </div>
              <Badge variant={data?.cvcrmStatus === 'connected' ? 'default' : 'secondary'} className="w-fit uppercase">
                {data?.cvcrmStatus ?? 'loading'}
              </Badge>
            </CardHeader>
            <CardContent>
              <DeliveryTable deliveries={deliveries} isLoading={observabilityQuery.isLoading} />
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Reprocessamento manual da DLQ
              </CardTitle>
              <CardDescription>Use após corrigir token, subdomínio, campos obrigatórios ou indisponibilidade da CV.CRM.</CardDescription>
            </CardHeader>
            <CardContent>
              <DlqTable
                dlq={dlq}
                isLoading={observabilityQuery.isLoading}
                processingId={reprocessMutation.variables?.id ?? null}
                onReprocess={(entry) => reprocessMutation.mutate(entry)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2 border-none shadow-sm">
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  Live Session Context
                </CardTitle>
                <CardDescription>Real-time state machine inspection</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">State Machine</label>
                      <div className="mt-1">
                        <Badge className={`text-lg px-4 py-1 font-black ${
                          auth.state === 'READY' ? 'bg-emerald-500' : 
                          auth.state === 'ERROR' ? 'bg-rose-500' : 'bg-primary animate-pulse'
                        }`}>
                          {auth.state}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Trace Identification</label>
                      <div className="mt-1 font-mono text-sm font-bold text-primary bg-primary/5 p-2 rounded border border-primary/10">
                        {auth.traceId}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">User Identity</label>
                      <div className="mt-2 flex items-center gap-3">
                         <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                           <User className="h-5 w-5 text-primary" />
                         </div>
                          <div className="min-w-0">
                           <p className="text-sm font-bold leading-none">{auth.user?.name || 'Unidentified'}</p>
                            <p className="mt-1 truncate text-[11px] text-muted-foreground">{auth.user?.email || 'No email associated'}</p>
                         </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Tenant Resolution</label>
                      <div className="mt-2 flex items-center gap-3">
                         <div className={`h-10 w-10 rounded-full flex items-center justify-center ${auth.company ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                           <ShieldCheck className="h-5 w-5" />
                         </div>
                         <div>
                           <p className="text-sm font-bold leading-none">{auth.company?.name || 'NULL TENANT'}</p>
                           <p className="text-[10px] font-mono text-muted-foreground mt-1">{auth.company?.id || 'Resolution failed'}</p>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="max-h-60 overflow-auto rounded-lg border bg-muted p-4 font-mono text-[10px] text-muted-foreground">
                  <p className="mb-2 text-primary">// Active Session Data</p>
                  <pre>{JSON.stringify({ 
                    state: auth.state, 
                    isAuthenticated: auth.isAuthenticated, 
                    isReady: auth.isReady, 
                    user: auth.user, 
                    company: auth.company 
                  }, null, 2)}</pre>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider">Test Suite</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start gap-3 h-11 font-bold" onClick={() => auth.refreshContext()}>
                    <RefreshCcw className="h-4 w-4 text-primary" />
                    Force Context Sync
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 h-11 font-bold" onClick={() => {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.reload();
                  }}>
                    <Key className="h-4 w-4 text-amber-500" />
                    Simulate Expiration
                  </Button>
                  <Button variant="destructive" className="w-full justify-start gap-3 h-11 font-bold" onClick={() => auth.logout()}>
                    <Zap className="h-4 w-4" />
                    Emergency Logout
                  </Button>
                </CardContent>
              </Card>

                <Card className="border-primary/10 bg-primary/5 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-2">
                    <LifeBuoy className="h-3 w-3" />
                    Deterministic Guard
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[11px] font-medium leading-relaxed text-muted-foreground">
                    The current architecture prevents rendering protected modules if state !== <b>READY</b>. 
                    This ensures race conditions never expose null company contexts.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface HealthSummaryItem {
  label: string;
  value: string;
  status: 'healthy' | 'degraded' | 'down';
}

function buildDeliverySummary(deliveries: DeliveryLog[], dlqCount: number, cvcrmStatus: string): HealthSummaryItem[] {
  const successCount = deliveries.filter((delivery) => delivery.status === 'success').length;
  const retryingCount = deliveries.filter((delivery) => delivery.status === 'retrying').length;
  const failedCount = deliveries.filter((delivery) => delivery.status === 'failed' || delivery.status === 'dead_letter').length;

  return [
    {
      label: 'CV.CRM Gateway',
      value: cvcrmStatus,
      status: cvcrmStatus === 'connected' ? 'healthy' : 'degraded',
    },
    {
      label: 'Success Window',
      value: `${successCount}/${deliveries.length}`,
      status: failedCount > successCount ? 'degraded' : 'healthy',
    },
    {
      label: 'Retry Queue',
      value: String(retryingCount),
      status: retryingCount > 0 ? 'degraded' : 'healthy',
    },
    {
      label: 'Dead Letters',
      value: String(dlqCount),
      status: dlqCount > 0 ? 'down' : 'healthy',
    },
  ];
}

function HealthCard({ item, isLoading }: { item: HealthSummaryItem; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-24" />;

  return (
    <Card className="border-none shadow-sm">
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className={item.status === 'down' ? 'text-destructive' : item.status === 'degraded' ? 'text-muted-foreground' : 'text-primary'}>
            <Server className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{item.label}</p>
            <p className="text-sm font-bold capitalize">{item.value}</p>
          </div>
        </div>
        <Badge variant={item.status === 'down' ? 'destructive' : item.status === 'degraded' ? 'secondary' : 'default'} className="font-bold capitalize">
          {item.status}
        </Badge>
      </CardContent>
    </Card>
  );
}

function SystemLogTable({ logs, isLoading }: { logs: SystemLog[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-56" />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Level</TableHead>
          <TableHead>Message</TableHead>
          <TableHead>Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.length === 0 ? (
          <EmptyRow colSpan={3} message="Nenhum log recente para este workspace." />
        ) : (
          logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell><Badge variant={log.level === 'error' ? 'destructive' : 'secondary'}>{log.level}</Badge></TableCell>
              <TableCell className="max-w-[360px] truncate text-xs font-medium">{log.component ? `${log.component}: ` : ''}{log.message}</TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(log.created_at)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function DlqSummary({ dlq, isLoading }: { dlq: DlqEntry[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-32" />;
  if (dlq.length === 0) {
    return (
      <div className="py-8 text-center">
        <CheckCircle2 className="mx-auto mb-2 h-12 w-12 text-primary" />
        <p className="text-sm font-bold">No critical failures</p>
        <p className="mt-1 text-xs text-muted-foreground">Dead Letter Queue is empty</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-3xl font-black text-destructive">{dlq.length}</p>
      <p className="text-sm font-medium text-muted-foreground">item(ns) aguardando reprocessamento manual.</p>
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Intervenção necessária</AlertTitle>
        <AlertDescription>Corrija a causa raiz antes de reenviar para evitar novo dead-letter.</AlertDescription>
      </Alert>
    </div>
  );
}

function DeliveryTable({ deliveries, isLoading }: { deliveries: DeliveryLog[]; isLoading: boolean }) {
  if (isLoading) return <Skeleton className="h-72" />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Status</TableHead>
          <TableHead>Lead</TableHead>
          <TableHead>Attempts</TableHead>
          <TableHead>HTTP</TableHead>
          <TableHead>Next retry</TableHead>
          <TableHead>Trace</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deliveries.length === 0 ? (
          <EmptyRow colSpan={6} message="Nenhuma tentativa CV.CRM registrada ainda." />
        ) : (
          deliveries.map((delivery) => (
            <TableRow key={delivery.id}>
              <TableCell><StatusBadge status={delivery.status} /></TableCell>
              <TableCell className="font-mono text-xs">{shortId(delivery.lead_id)}</TableCell>
              <TableCell className="text-xs font-bold">{delivery.attempt_count ?? 0}</TableCell>
              <TableCell className="text-xs">{delivery.status_code ?? '—'}</TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(delivery.next_retry_at)}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{shortId(delivery.trace_id)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function DlqTable({
  dlq,
  isLoading,
  processingId,
  onReprocess,
}: {
  dlq: DlqEntry[];
  isLoading: boolean;
  processingId: string | null;
  onReprocess: (entry: DlqEntry) => void;
}) {
  if (isLoading) return <Skeleton className="h-80" />;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Created</TableHead>
          <TableHead>Lead</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Retries</TableHead>
          <TableHead>Trace</TableHead>
          <TableHead className="text-right">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {dlq.length === 0 ? (
          <EmptyRow colSpan={6} message="DLQ vazia. Nenhuma falha definitiva pendente." />
        ) : (
          dlq.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(entry.created_at)}</TableCell>
              <TableCell className="font-mono text-xs">{shortId(entry.lead_id)}</TableCell>
              <TableCell className="max-w-[360px] truncate text-xs" title={entry.last_error ?? entry.failure_reason ?? undefined}>
                {entry.failure_reason ?? entry.last_error ?? 'Falha sem mensagem registrada'}
              </TableCell>
              <TableCell className="text-xs font-bold">{entry.retry_count ?? 0}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{shortId(entry.trace_id)}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" className="gap-2" disabled={Boolean(processingId)} onClick={() => onReprocess(entry)}>
                  {processingId === entry.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  Reprocessar
                </Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'success' ? 'default' : status === 'retrying' || status === 'sending' ? 'secondary' : 'destructive';
  return <Badge variant={variant} className="capitalize">{status}</Badge>;
}

function EmptyRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-xs italic text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function shortId(value: string | null): string {
  if (!value) return '—';
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}
