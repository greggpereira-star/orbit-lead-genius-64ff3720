import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, TrendingUp, TrendingDown, Flame, ListChecks, Megaphone, Zap, ArrowUpRight, MessageSquare,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { dashboardService } from '@/modules/analytics/services/dashboardService';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/dashboard')({
  head: () => ({
    meta: [
      { title: 'Dashboard Executivo — Alt LeadFlow' },
      { name: 'description', content: 'KPIs consolidados de leads, quiz, Meta Ads e integrações CRM.' },
    ],
  }),
  component: DashboardPage,
});

const RANGES = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
] as const;

const PIE_COLORS = [
  'hsl(var(--primary))',
  'oklch(0.68 0.19 145)',
  'oklch(0.75 0.15 80)',
  'oklch(0.65 0.23 300)',
  'oklch(0.59 0.23 27)',
  'oklch(0.7 0.14 220)',
];

function DashboardPage() {
  const { company } = useAuth();
  const companyId = company?.id;
  const [days, setDays] = useState<number>(30);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', companyId, days],
    queryFn: () => dashboardService.getKpis(companyId as string, days),
    enabled: !!companyId,
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Executivo</h1>
          <p className="text-sm text-muted-foreground">
            Visão consolidada de leads, quiz e integrações — últimos {days} dias.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-card p-1">
            {RANGES.map((r) => (
              <button
                key={r.days}
                onClick={() => setDays(r.days)}
                className={cn(
                  'rounded px-3 py-1.5 text-xs font-medium transition',
                  days === r.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/leads"><ArrowUpRight className="h-4 w-4 mr-1" />Ver leads</Link>
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Leads no período"
          value={isLoading ? null : data?.leadsThisPeriod ?? 0}
          delta={data?.leadsDelta}
          icon={Users}
          hint={`Total geral: ${data?.totalLeads ?? 0}`}
        />
        <KpiCard
          title="Leads quentes 🔥"
          value={isLoading ? null : data?.hotLeads ?? 0}
          icon={Flame}
          tone="warning"
          hint={`Warm: ${data?.temperature.warm ?? 0} · Cold: ${data?.temperature.cold ?? 0}`}
        />
        <KpiCard
          title="Conversão Quiz"
          value={isLoading ? null : `${(data?.quizConversion ?? 0).toFixed(1)}%`}
          icon={ListChecks}
          tone="success"
          hint={`${data?.quizCompleted ?? 0} de ${data?.quizSubmissions ?? 0} completos`}
        />
        <KpiCard
          title="CRM entregue"
          value={isLoading ? null : `${(data?.cvcrmSuccessRate ?? 0).toFixed(1)}%`}
          icon={Zap}
          tone={data && data.cvcrmFailed > 0 ? 'danger' : 'success'}
          hint={`${data?.cvcrmDelivered ?? 0} entregues · ${data?.cvcrmFailed ?? 0} falhas`}
        />
      </div>

      {/* Séries e origens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Leads & submissões por dia</CardTitle>
            <CardDescription>Volume diário — atualização em tempo quase real</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading || !data ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dailySeries}>
                  <defs>
                    <linearGradient id="gLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gSubs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.68 0.19 145)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="oklch(0.68 0.19 145)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke="hsl(var(--primary))" fill="url(#gLeads)" strokeWidth={2} />
                  <Area type="monotone" dataKey="submissions" name="Quiz" stroke="oklch(0.68 0.19 145)" fill="url(#gSubs)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Origem dos leads</CardTitle>
            <CardDescription>Distribuição por canal</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {isLoading || !data ? (
              <Skeleton className="w-full h-full" />
            ) : data.sources.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.sources} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {data.sources.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* WhatsApp + Meta + Leads recentes */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-[#25D366]" />WhatsApp</CardTitle>
            <CardDescription>Cliques, conversão em lead e envio para Meta CAPI</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Cliques</p>
                <div className="text-2xl font-bold">{isLoading ? '—' : data?.whatsapp.clicks ?? 0}</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Viraram lead</p>
                <div className="text-2xl font-bold">{data?.whatsapp.leadsFromClicks ?? 0}</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Conversão</p>
                <div className="text-2xl font-bold text-emerald-500">{(data?.whatsapp.conversionRate ?? 0).toFixed(1)}%</div>
              </div>
            </div>

            {data && (
              <div className="pt-3 border-t grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Top origens (utm_source)</p>
                  {data.whatsapp.topSources.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem dados</p>
                  ) : data.whatsapp.topSources.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs py-0.5">
                      <span className="truncate">{s.name}</span>
                      <Badge variant="outline" className="ml-2">{s.value}</Badge>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Top campanhas</p>
                  {data.whatsapp.topCampaigns.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem dados</p>
                  ) : data.whatsapp.topCampaigns.map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-xs py-0.5">
                      <span className="truncate">{s.name}</span>
                      <Badge variant="outline" className="ml-2">{s.value}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data && (
              <div className="pt-3 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Meta CAPI (Conversions API)</p>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="outline" className="bg-emerald-500/10 border-emerald-500/30">Enviados: {data.whatsapp.capi.sent}</Badge>
                  <Badge variant="outline">Pendentes: {data.whatsapp.capi.pending}</Badge>
                  <Badge variant="outline" className="bg-amber-500/10 border-amber-500/30">Retry: {data.whatsapp.capi.failed}</Badge>
                  <Badge variant="outline" className="bg-red-500/10 border-red-500/30">DLQ: {data.whatsapp.capi.deadLetter}</Badge>
                  <Badge variant="outline" className="text-muted-foreground">Sem integração: {data.whatsapp.capi.skipped}</Badge>
                </div>
              </div>
            )}

            <Button asChild variant="link" className="px-0">
              <Link to="/settings/widgets">Instalar widget <ArrowUpRight className="h-3 w-3 ml-1" /></Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Megaphone className="h-4 w-4" />Meta Lead Ads</CardTitle>
            <CardDescription>Eventos recebidos no período</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{isLoading ? '—' : data?.metaLeads ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Leads via webhook do Facebook/Instagram</p>
            <Button asChild variant="link" className="px-0 mt-2">
              <Link to="/integrations/meta">Configurar integração <ArrowUpRight className="h-3 w-3 ml-1" /></Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Leads recentes</CardTitle>
              <CardDescription>Últimas capturas no período</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost"><Link to="/leads">Ver todos</Link></Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (data?.recentLeads.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem leads no período.</p>
            ) : (
              <div className="divide-y divide-border">
                {data!.recentLeads.map((l) => (
                  <div key={l.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{l.name ?? 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {l.source ?? 'Direto'} · {new Date(l.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {typeof l.score === 'number' && <Badge variant="outline">{l.score}</Badge>}
                      {l.temperature && <TemperatureBadge t={l.temperature} />}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface KpiCardProps {
  title: string;
  value: number | string | null;
  delta?: number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

function KpiCard({ title, value, delta, icon: Icon, hint, tone = 'default' }: KpiCardProps) {
  const toneClass = {
    default: 'text-primary',
    success: 'text-emerald-500',
    warning: 'text-amber-500',
    danger: 'text-red-500',
  }[tone];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn('h-4 w-4', toneClass)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value === null ? <Skeleton className="h-7 w-16" /> : value}</div>
        {typeof delta === 'number' && (
          <p className={cn('text-xs mt-1 flex items-center gap-1', delta >= 0 ? 'text-emerald-500' : 'text-red-500')}>
            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs período anterior
          </p>
        )}
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function TemperatureBadge({ t }: { t: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    hot: { label: '🔥 Hot', cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
    warm: { label: 'Warm', cls: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
    cold: { label: 'Cold', cls: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  };
  const cfg = map[t] ?? { label: t, cls: '' };
  return <Badge variant="outline" className={cfg.cls}>{cfg.label}</Badge>;
}
