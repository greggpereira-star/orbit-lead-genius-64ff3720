import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { DealValueCard } from '@/modules/crm/components/DealValueCard';
import {
  Activity,
  Archive,
  ArrowLeft,
  Brain,
  Calendar,
  Layers,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Target,
  Zap,
} from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/core/auth/hooks/useAuth';
import {
  archiveLead,
  getLeadCompanyName,
  getLeadDetails,
  getLeadDisplayName,
  getLeadMetadata,
  getLeadScore,
  getLeadTemperature,
  updateLeadStatus,
  type LeadDetails,
  type LeadEventRow,
} from '@/modules/crm/services/leadService';

export const Route = createFileRoute('/_app/leads/$id')({
  component: LeadDetailsPage,
});

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived'];

function LeadDetailsPage() {
  const { id } = Route.useParams();
  const { company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = company?.id;

  const detailsQuery = useQuery({
    queryKey: ['lead-details', companyId, id],
    queryFn: () => getLeadDetails(id, companyId ?? ''),
    enabled: Boolean(companyId && id),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => {
      if (!companyId) throw new Error('Workspace não carregado.');
      return updateLeadStatus({ leadId: id, companyId, status });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lead-details', companyId, id] });
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Status atualizado.');
    },
    onError: () => toast.error('Não foi possível atualizar o status.'),
  });

  const archiveMutation = useMutation({
    mutationFn: () => {
      if (!companyId) throw new Error('Workspace não carregado.');
      return archiveLead({ leadId: id, companyId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead arquivado sem exclusão física.');
      navigate({ to: '/leads' });
    },
    onError: () => toast.error('Não foi possível arquivar o lead.'),
  });

  if (detailsQuery.isLoading) return <LeadDetailsSkeleton />;
  if (detailsQuery.isError) return <StateMessage title="Erro ao carregar lead" description="Tente novamente ou volte para a lista de leads." />;
  if (!detailsQuery.data) return <StateMessage title="Lead não encontrado" description="O lead pode ter sido arquivado, removido ou pertencer a outro workspace." />;

  const details = detailsQuery.data;
  const lead = details.lead;
  const score = getLeadScore(lead);
  const temperature = getLeadTemperature(lead);
  const metadata = getLeadMetadata(lead);
  const phoneUrl = createWhatsAppUrl(lead.phone);
  const companyName = getLeadCompanyName(lead);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: '/leads' })} aria-label="Voltar para leads">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{getLeadDisplayName(lead)}</h1>
              <Badge variant="secondary">{formatLabel(lead.status || 'new')}</Badge>
              <Badge variant={temperature === 'hot' ? 'default' : 'outline'}>{formatLabel(temperature)}</Badge>
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {companyName ? `${companyName} • ` : ''}{lead.source || lead.utm_source || 'Origem direta'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={lead.status || 'new'} onValueChange={(value) => statusMutation.mutate(value)} disabled={statusMutation.isPending}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{formatLabel(option)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" disabled={!phoneUrl} onClick={() => phoneUrl && window.open(phoneUrl, '_blank', 'noopener,noreferrer')}>
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Archive className="h-4 w-4" />
                Arquivar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Arquivar este lead?</AlertDialogTitle>
                <AlertDialogDescription>
                  O contato sairá da lista principal, mas histórico, eventos e dados de auditoria permanecem preservados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}>Arquivar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">Contato</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ContactRow icon={<Mail className="h-4 w-4" />} label="E-mail" value={lead.email || 'Não informado'} />
              <ContactRow icon={<Phone className="h-4 w-4" />} label="Telefone" value={lead.phone || 'Não informado'} />
              <ContactRow icon={<Calendar className="h-4 w-4" />} label="Criado" value={formatDateTime(lead.created_at)} />
            </CardContent>
          </Card>

          <DealValueCard
            leadId={lead.id}
            valorAtual={(lead as unknown as { deal_value?: number | string | null }).deal_value}
            moeda={(lead as unknown as { deal_currency?: string }).deal_currency ?? 'BRL'}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold uppercase text-muted-foreground">Score comercial</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end justify-between">
                <div className="text-4xl font-black tracking-tight text-foreground">{score}</div>
                <Badge variant={temperature === 'hot' ? 'default' : 'secondary'}>{formatLabel(temperature)}</Badge>
              </div>
              <Progress value={score} />
              <p className="text-xs text-muted-foreground">Score consolidado entre captura, formulários, quizzes e regras de qualificação.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
                <Target className="h-4 w-4" />
                Atribuição
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <KeyValue label="Origem" value={lead.utm_source || lead.source || 'Direto'} />
              <KeyValue label="Campanha" value={lead.utm_campaign || 'Sem campanha'} />
              <KeyValue label="GCLID" value={lead.gclid || 'Não capturado'} />
              <KeyValue label="FBCLID" value={lead.fbclid || 'Não capturado'} />
            </CardContent>
          </Card>
        </aside>

        <section className="lg:col-span-2">
          <Tabs defaultValue="activity" className="w-full">
            <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-none border-b bg-transparent p-0">
              <LeadTab value="activity" icon={<Activity className="h-4 w-4" />} label="Atividade" />
              <LeadTab value="intelligence" icon={<Brain className="h-4 w-4" />} label="Inteligência" />
              <LeadTab value="tracking" icon={<Layers className="h-4 w-4" />} label="Tracking" />
              <LeadTab value="compliance" icon={<ShieldCheck className="h-4 w-4" />} label="LGPD" />
            </TabsList>

            <TabsContent value="activity" className="pt-6">
              <ActivityTimeline events={details.events} />
            </TabsContent>

            <TabsContent value="intelligence" className="pt-6">
              <IntelligencePanel details={details} />
            </TabsContent>

            <TabsContent value="tracking" className="pt-6">
              <TrackingPanel details={details} />
            </TabsContent>

            <TabsContent value="compliance" className="pt-6">
              <CompliancePanel metadata={metadata} createdAt={lead.created_at} />
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}

function ContactRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="text-muted-foreground">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase text-muted-foreground">{label}</div>
        <div className="truncate font-semibold text-foreground">{value}</div>
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-semibold text-foreground">{value}</span>
    </div>
  );
}

function LeadTab({ value, icon, label }: { value: string; icon: ReactNode; label: string }) {
  return (
    <TabsTrigger value={value} className="gap-2 rounded-none border-b-2 border-transparent px-1 pb-3 data-[state=active]:border-primary data-[state=active]:bg-transparent">
      {icon}
      {label}
    </TabsTrigger>
  );
}

function ActivityTimeline({ events }: { events: LeadEventRow[] }) {
  if (events.length === 0) {
    return <EmptyPanel title="Sem eventos registrados" description="Novas mudanças de status, capturas e integrações aparecerão aqui." />;
  }

  return (
    <div className="relative space-y-6 before:absolute before:bottom-0 before:left-5 before:top-0 before:w-px before:bg-border">
      {events.map((event) => (
        <div key={event.id} className="relative flex gap-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background ring-4 ring-background">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1 rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-bold text-foreground">{formatLabel(event.event_type)}</h3>
              <span className="text-xs font-medium text-muted-foreground">{event.created_at ? formatDateTime(event.created_at) : 'Sem data'}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{event.description || 'Evento registrado.'}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function IntelligencePanel({ details }: { details: LeadDetails }) {
  const metadata = getLeadMetadata(details.lead);
  const analysisSummary = readRecordString(details.analysis, 'summary') ?? readRecordString(metadata, 'summary');
  const nextStep = readRecordString(metadata, 'recommended_next_step') ?? 'Priorizar contato humano com contexto de origem e intenção.';
  const buyingIntent = readRecordString(metadata, 'buying_intent') ?? 'Médio';

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-primary" />
            Resumo de intenção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{analysisSummary || 'Ainda não há análise de IA para este lead.'}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próxima ação recomendada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-primary/5 p-3 text-sm font-semibold text-primary">{nextStep}</div>
          <KeyValue label="Intenção de compra" value={buyingIntent} />
          <KeyValue label="Origem do score" value={details.lead.source || details.lead.utm_source || 'Captura direta'} />
        </CardContent>
      </Card>
    </div>
  );
}

function TrackingPanel({ details }: { details: LeadDetails }) {
  if (details.tracking.length === 0) {
    return <EmptyPanel title="Sem tracking de sessão" description="Quando houver visitor_id associado ao lead, as páginas visitadas aparecerão aqui." />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="p-3 text-left text-xs font-bold uppercase text-muted-foreground">Página</th>
            <th className="p-3 text-left text-xs font-bold uppercase text-muted-foreground">URL</th>
            <th className="p-3 text-right text-xs font-bold uppercase text-muted-foreground">Horário</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {details.tracking.map((view) => (
            <tr key={view.id} className="hover:bg-muted/40">
              <td className="p-3 font-semibold text-foreground">{view.title || 'Página sem título'}</td>
              <td className="max-w-[320px] truncate p-3 font-mono text-xs text-muted-foreground">{view.url}</td>
              <td className="p-3 text-right text-xs text-muted-foreground">{view.created_at ? formatDateTime(view.created_at) : 'Sem data'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompliancePanel({ metadata, createdAt }: { metadata: Record<string, unknown>; createdAt: string }) {
  const consents = typeof metadata.consents === 'object' && metadata.consents !== null ? metadata.consents as Record<string, unknown> : {};
  const marketingConsent = consents.marketing === true;
  const trackingConsent = consents.tracking === true;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Privacidade e consentimento</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <ConsentItem label="Marketing" granted={marketingConsent} />
          <ConsentItem label="Tracking" granted={trackingConsent} />
        </div>
        <div className="rounded-lg border bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
          <p>Consent version: {readRecordString(metadata, 'consent_version') || 'N/A'}</p>
          <p>IP: {readRecordString(metadata, 'ip') || 'Masked'}</p>
          <p>Created: {formatDateTime(createdAt)}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ConsentItem({ label, granted }: { label: string; granted: boolean }) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <Badge variant={granted ? 'default' : 'secondary'}>{granted ? 'Concedido' : 'Não informado'}</Badge>
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border bg-card p-8 text-center">
      <p className="font-bold text-foreground">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StateMessage({ title, description }: { title: string; description: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button onClick={() => navigate({ to: '/leads' })}>Voltar para leads</Button>
      </div>
    </div>
  );
}

function LeadDetailsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80" />
        <Skeleton className="h-80 lg:col-span-2" />
      </div>
    </div>
  );
}

function createWhatsAppUrl(phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

function readRecordString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}