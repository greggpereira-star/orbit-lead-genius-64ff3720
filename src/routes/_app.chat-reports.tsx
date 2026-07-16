import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatReportsService } from '@/modules/chat/services/chatReportsService';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart3, MessageCircle, Users, TrendingUp, Clock, ArrowLeft } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

export const Route = createFileRoute('/_app/chat-reports')({
  component: ChatReportsPage,
});

function ChatReportsPage() {
  const { company } = useAuth();
  const [days, setDays] = useState<7 | 14 | 30 | 90>(30);

  const q = useQuery({
    queryKey: ['chat-reports', company?.id, days],
    queryFn: () => chatReportsService.summary(company!.id, days),
    enabled: !!company?.id,
  });

  const agentsQ = useQuery({
    queryKey: ['chat-reports-agents', company?.id, days],
    queryFn: () => chatReportsService.perAgent(company!.id, days),
    enabled: !!company?.id,
  });

  const data = q.data;
  const agents = agentsQ.data ?? [];

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link to="/inbox" className="hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Chat ao vivo
            </Link>
          </div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" /> Relatórios do chat
          </h1>
          <p className="text-sm text-muted-foreground">Visão consolidada de conversas, mensagens e conversão em leads.</p>
        </div>
        <div className="flex gap-1">
          {([7, 14, 30, 90] as const).map((d) => (
            <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
        </div>
      </header>

      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {data && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
            <KPI icon={<MessageCircle className="h-4 w-4" />} label="Conversas" value={data.total} sub={`${data.open} abertas · ${data.closed} encerradas`} />
            <KPI icon={<TrendingUp className="h-4 w-4" />} label="Mensagens" value={data.messagesTotal} sub={`${data.messagesFromAgents} atendentes · ${data.messagesFromVisitors} visitantes`} />
            <KPI icon={<Users className="h-4 w-4" />} label="Leads capturados" value={data.leadsCaptured} sub={`${data.conversionRate.toFixed(1)}% de conversão`} />
            <KPI icon={<Clock className="h-4 w-4" />} label="Msgs / conversa" value={data.avgMessagesPerConversation.toFixed(1)} sub="Média no período" />
            <KPI
              icon={<span className="text-amber-500">★</span>}
              label="CSAT"
              value={data.avgRating != null ? `${data.avgRating.toFixed(1)}/5` : '—'}
              sub={`${data.ratingCount} avaliação${data.ratingCount === 1 ? '' : 'ões'}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Volume por dia</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.byDay}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tickFormatter={(v) => v.slice(5)} className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="conversations" name="Conversas" stroke="hsl(var(--primary))" strokeWidth={2} />
                    <Line type="monotone" dataKey="messages" name="Mensagens" stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Páginas com mais conversas</CardTitle>
            </CardHeader>
            <CardContent>
              {data.topPages.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados de página no período.</p>
              ) : (
                <ul className="space-y-2">
                  {data.topPages.map((p) => (
                    <li key={p.url} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-mono text-xs">{p.url}</span>
                      <Badge variant="secondary">{p.count}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KPI({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          {icon} {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
