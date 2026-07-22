import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, Users, Target, Flame, Download, FlaskConical, Trophy, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { quizService } from '@/modules/quiz/services/quizService';
import { useAuth } from '@/core/auth/hooks/useAuth';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from 'recharts';

export const Route = createFileRoute('/_app/quizzes/$id/performance')({
  component: QuizPerformancePage,
});

const AB_MIN_VIEWS = 30;
const AB_MIN_LEAD_POINTS = 10;

type Metrics = Awaited<ReturnType<typeof quizService.getMetrics>>;
type Submission = Awaited<ReturnType<typeof quizService.listSubmissions>>[number];
type AbTestStats = Awaited<ReturnType<typeof quizService.getAbTestStats>>;

function QuizPerformancePage() {
  const { id } = useParams({ from: '/_app/quizzes/$id/performance' });
  const { company, user } = useAuth();
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [abTests, setAbTests] = useState<AbTestStats>([]);
  const [loading, setLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const refreshAbTests = () => {
    quizService.getAbTestStats(id, days).then(setAbTests).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    const fetchData = (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      Promise.all([quizService.getMetrics(id, days), quizService.listSubmissions(id, 100), quizService.getAbTestStats(id, days)])
        .then(([m, s, ab]) => {
          if (cancelled) return;
          setMetrics(m);
          setSubs(s);
          setAbTests(ab);
        })
        .finally(() => {
          if (!cancelled && showLoading) setLoading(false);
        });
    };
    fetchData(true);
    const interval = window.setInterval(() => fetchData(false), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [id, days]);

  const handlePromote = async (blockId: string, variantId: string) => {
    if (!company?.id || !user?.id) return;
    setPromotingId(`${blockId}:${variantId}`);
    try {
      await quizService.promoteVariant({ quizId: id, companyId: company.id, userId: user.id, blockId, variantId });
      toast.success('Variação promovida como versão principal do bloco');
      refreshAbTests();
    } catch (e: unknown) {
      toast.error('Erro ao promover: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPromotingId(null);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['data', 'nome', 'email', 'telefone', 'score', 'temperatura', 'completo'],
      ...subs.map((s) => [
        s.created_at,
        s.name ?? '',
        s.email ?? '',
        s.phone ?? '',
        String(s.score ?? ''),
        s.temperature ?? '',
        s.completed ? 'sim' : 'não',
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quiz-${id}-submissions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tempData = useMemo(
    () =>
      metrics
        ? [
            { name: 'Hot', value: metrics.temperature.hot, fill: 'hsl(0 84% 60%)' },
            { name: 'Warm', value: metrics.temperature.warm, fill: 'hsl(38 92% 50%)' },
            { name: 'Cold', value: metrics.temperature.cold, fill: 'hsl(217 91% 60%)' },
          ]
        : [],
    [metrics],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/quizzes"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Performance</h1>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={days === d ? 'default' : 'outline'} onClick={() => setDays(d)}>
              {d}d
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={exportCsv} className="gap-2">
            <Download className="h-4 w-4" /> CSV
          </Button>
        </div>
      </div>

      {loading || !metrics ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">Carregando métricas…</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={<Users className="h-4 w-4" />} label="Inícios" value={metrics.starts} />
            <StatCard icon={<Target className="h-4 w-4" />} label="Conclusões" value={metrics.completions} />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Taxa de conversão"
              value={`${metrics.conversionRate.toFixed(1)}%`}
            />
            <StatCard icon={<Flame className="h-4 w-4" />} label="Leads capturados" value={metrics.leadsCaptured} />
          </div>

          <Card className="p-6">
            <h3 className="font-semibold mb-4">Inícios vs Conclusões ({days} dias)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.dailySeries}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="starts" stroke="hsl(217 91% 60%)" strokeWidth={2} name="Inícios" />
                  <Line type="monotone" dataKey="completions" stroke="hsl(142 71% 45%)" strokeWidth={2} name="Conclusões" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Temperatura dos leads</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={tempData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="value" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Score médio: <span className="font-semibold text-foreground">{metrics.avgScore.toFixed(1)}</span>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold mb-4">Funil por etapa</h3>
              {metrics.dropOffByBlock.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem eventos de bloco ainda.</p>
              ) : (
                <div className="space-y-2 max-h-56 overflow-auto">
                  {metrics.dropOffByBlock.map((b, i) => {
                    const pct = metrics.dropOffByBlock[0].views > 0
                      ? (b.views / metrics.dropOffByBlock[0].views) * 100
                      : 0;
                    return (
                      <div key={b.blockId} className="text-xs">
                        <div className="flex justify-between mb-1 gap-2">
                          <span className="text-muted-foreground truncate">#{i + 1} {b.label}</span>
                          <span className="flex items-center gap-1.5 shrink-0">
                            <span className="font-semibold">{b.views}</span>
                            {i > 0 && b.dropRate > 0 && (
                              <span className="text-red-600">-{b.dropRate.toFixed(0)}%</span>
                            )}
                          </span>
                        </div>
                        <div className="h-2 rounded bg-muted overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="font-semibold mb-4">Origem das respostas (UTM)</h3>
            {metrics.utmBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados de UTM ainda.</p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Campanha</th>
                      <th className="text-left py-2 px-2">Origem</th>
                      <th className="text-left py-2 px-2">Submissões</th>
                      <th className="text-left py-2 px-2">Conclusões</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.utmBreakdown.map((u) => (
                      <tr key={`${u.campaign}::${u.source}`} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="py-2 px-2">{u.campaign}</td>
                        <td className="py-2 px-2">{u.source}</td>
                        <td className="py-2 px-2 font-semibold">{u.submissions}</td>
                        <td className="py-2 px-2">{u.completions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {abTests.length > 0 && (
            <Card className="p-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" /> Testes A/B
              </h3>
              <div className="space-y-6">
                {abTests.map((test) => {
                  const sorted = [...test.variants].sort((a, b) => b.conversionRate - a.conversionRate);
                  const leader = sorted[0];
                  const runnerUp = sorted[1];
                  const hasWinner =
                    leader &&
                    leader.views >= AB_MIN_VIEWS &&
                    (!runnerUp || runnerUp.views >= AB_MIN_VIEWS) &&
                    (!runnerUp || leader.conversionRate - runnerUp.conversionRate >= AB_MIN_LEAD_POINTS);

                  return (
                    <div key={test.blockId}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium truncate">{test.blockLabel}</span>
                        {hasWinner && (
                          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                            <Trophy className="h-3.5 w-3.5" /> Vencedor sugerido: {leader.label}
                          </span>
                        )}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {test.variants.map((v) => {
                          const isLeader = hasWinner && v.id === leader.id;
                          const key = `${test.blockId}:${v.id}`;
                          return (
                            <div
                              key={v.id}
                              className={`rounded-lg border p-3 text-xs space-y-1.5 ${isLeader ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold truncate">{v.label}</span>
                                <span className="text-muted-foreground">{v.views} views</span>
                              </div>
                              <div className="text-muted-foreground">
                                Avanço: <span className="font-semibold text-foreground">{v.conversionRate.toFixed(1)}%</span> ({v.advances})
                              </div>
                              {isLeader && v.id !== 'control' && (
                                <Button
                                  size="sm"
                                  className="w-full gap-1.5 mt-1"
                                  disabled={promotingId === key}
                                  onClick={() => handlePromote(test.blockId, v.id)}
                                >
                                  {promotingId === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trophy className="h-3 w-3" />}
                                  Promover
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Últimas submissões</h3>
              <span className="text-xs text-muted-foreground">{subs.length} registros</span>
            </div>
            {subs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma submissão ainda.</p>
            ) : (
              <div className="overflow-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b">
                    <tr>
                      <th className="text-left py-2 px-2">Data</th>
                      <th className="text-left py-2 px-2">Nome</th>
                      <th className="text-left py-2 px-2">Contato</th>
                      <th className="text-left py-2 px-2">Score</th>
                      <th className="text-left py-2 px-2">Temp.</th>
                      <th className="text-left py-2 px-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((s) => (
                      <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="py-2 px-2 whitespace-nowrap text-xs">{new Date(s.created_at).toLocaleString('pt-BR')}</td>
                        <td className="py-2 px-2">{s.name ?? '—'}</td>
                        <td className="py-2 px-2 text-xs">{s.email ?? s.phone ?? '—'}</td>
                        <td className="py-2 px-2 font-semibold">{s.score?.toFixed(0) ?? '—'}</td>
                        <td className="py-2 px-2">
                          {s.temperature ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                                s.temperature === 'hot'
                                  ? 'bg-red-500/10 text-red-600'
                                  : s.temperature === 'warm'
                                    ? 'bg-amber-500/10 text-amber-600'
                                    : 'bg-blue-500/10 text-blue-600'
                              }`}
                            >
                              {s.temperature}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-2 px-2 text-xs">{s.completed ? '✓ completo' : 'parcial'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
    </Card>
  );
}
