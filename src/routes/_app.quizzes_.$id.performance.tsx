import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, TrendingUp, Users, Target, Flame, Download, FlaskConical, Trophy, Loader2, Megaphone, Smartphone, Globe2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { quizService } from '@/modules/quiz/services/quizService';
import { getSteps } from '@/modules/quiz/lib/steps';
import { calcularConversaoPorEtapa, CORES_DE_FAIXA, MINIMO_PARA_NOTA } from '@/modules/quiz/lib/stepConversion';
import { calcularMetricasAvancadas, MINIMO_DE_SESSOES } from '@/modules/quiz/lib/metricasAvancadas';
import type { EventoBruto, SubmissaoBruta } from '@/modules/quiz/lib/metricasAvancadas';
import type { QuizStep } from '@/modules/quiz/types';
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

export const Route = createFileRoute('/_app/quizzes_/$id/performance')({
  component: QuizPerformancePage,
});

const AB_MIN_VIEWS = 30;
const AB_MIN_LEAD_POINTS = 10;

type Metrics = Awaited<ReturnType<typeof quizService.getMetrics>>;
type Submission = Awaited<ReturnType<typeof quizService.listSubmissions>>[number];
type AbTestStats = Awaited<ReturnType<typeof quizService.getAbTestStats>>;

function QuizPerformancePage() {
  const { id } = useParams({ from: '/_app/quizzes_/$id/performance' });
  const { company, user } = useAuth();
  const [days, setDays] = useState(30);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [abTests, setAbTests] = useState<AbTestStats>([]);
  const [loading, setLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [steps, setSteps] = useState<QuizStep[]>([]);
  const [eventosDeEtapa, setEventosDeEtapa] = useState<{ block_id: string | null; session_id: string | null }[]>([]);
  const [avancados, setAvancados] = useState<{ eventos: EventoBruto[]; submissoes: SubmissaoBruta[] }>({ eventos: [], submissoes: [] });

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
    /* A nota por etapa precisa do esquema (quais blocos formam cada etapa) e
       dos eventos com sessão — nenhum dos dois vem de `getMetrics`. */
    Promise.all([
      quizService.getLatestSchema(id),
      quizService.getStepViewEvents(id, days),
      quizService.getDadosAvancados(id, days),
    ])
      .then(([sch, ev, av]) => {
        if (cancelled) return;
        setSteps(getSteps(sch));
        setEventosDeEtapa(ev);
        setAvancados(av);
      })
      .catch(() => {});
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
      // Promover grava rascunho, não vai pro ar sozinho — dizer só "promovida"
      // faria o usuário achar que o visitante já está vendo a variante nova.
      toast.success('Variação promovida no rascunho', {
        description: 'Publique o quiz no Builder para o link público mostrar a versão nova.',
      });
      refreshAbTests();
    } catch (e: unknown) {
      toast.error('Erro ao promover: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setPromotingId(null);
    }
  };

  const [exportando, setExportando] = useState(false);

  /**
   * Exporta TODAS as submissões do período, não as 100 da tela.
   *
   * O CSV saía de `subs`, que é a lista visível limitada a 100: quem tivesse
   * 500 respostas exportava 100 e não era avisado de nada. Agora a consulta é
   * própria, e traz as UTMs — que são o motivo de alguém exportar.
   */
  const exportCsv = async () => {
    setExportando(true);
    try {
      const linhas = await quizService.getSubmissionsParaExport(id, 90);
      const contato = (a: Record<string, unknown> | null) =>
        (a?._contact ?? {}) as { name?: string; email?: string; phone?: string };
      const rows = [
        ['data', 'nome', 'email', 'telefone', 'score', 'temperatura', 'completo',
         'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'],
        ...linhas.map((l) => {
          const c = contato(l.answers);
          const t = (l.tracking ?? {}) as Record<string, string>;
          return [
            l.created_at, c.name ?? '', c.email ?? '', c.phone ?? '',
            String(l.score ?? ''), l.temperature ?? '', l.status === 'completed' ? 'sim' : 'não',
            t.utm_source ?? '', t.utm_medium ?? '', t.utm_campaign ?? '', t.utm_content ?? '', t.utm_term ?? '',
          ];
        }),
      ];
      const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      // BOM: sem ele o Excel no Windows abre os acentos quebrados.
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-${id}-respostas.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${linhas.length} resposta(s) exportada(s)`);
    } catch (e) {
      console.error('Erro ao exportar', e);
      toast.error('Não foi possível exportar agora.');
    } finally {
      setExportando(false);
    }
  };

  const [resetando, setResetando] = useState(false);
  const resetarDados = async () => {
    const frase = 'APAGAR';
    const digitado = window.prompt(
      'Isto apaga TODAS as respostas, eventos e leads deste quiz. O funil continua igual; só o histórico some. Não dá para desfazer.\n\nDigite ' + frase + ' para confirmar:',
    );
    if (digitado !== frase) return;
    setResetando(true);
    try {
      const r = await quizService.resetarDados(id);
      toast.success('Dados apagados', {
        description: `${r.submissoes} resposta(s), ${r.eventos} evento(s) e ${r.leads} lead(s).`,
      });
      window.location.reload();
    } catch (e) {
      console.error('Erro ao resetar', e);
      toast.error('Não foi possível apagar os dados agora.');
    } finally {
      setResetando(false);
    }
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
          <Button size="sm" variant="outline" onClick={() => void exportCsv()} disabled={exportando} className="gap-2">
            <Download className="h-4 w-4" /> {exportando ? 'Exportando…' : 'CSV'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void resetarDados()}
            disabled={resetando}
            className="gap-2 text-destructive hover:text-destructive"
            title="Apaga respostas, eventos e leads deste quiz"
          >
            <Trash2 className="h-4 w-4" /> Resetar dados
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

            <Card className="p-6 md:col-span-2">
              <MetricasAvancadas steps={steps} eventos={avancados.eventos} submissoes={avancados.submissoes} />
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold mb-1">Conversão por etapa</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Quantos dos que viram a etapa seguiram adiante. Contado por visitante,
                não por visualização.
              </p>
              <ConversaoPorEtapa steps={steps} eventos={eventosDeEtapa} />
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold mb-4">Funil por etapa (blocos)</h3>
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
                              <span className="text-destructive">-{b.dropRate.toFixed(0)}%</span>
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
            <Tabs defaultValue="aquisicao">
              <TabsList>
                <TabsTrigger value="aquisicao" className="gap-1.5"><Megaphone className="h-3.5 w-3.5" />Aquisição</TabsTrigger>
                <TabsTrigger value="audiencia" className="gap-1.5"><Smartphone className="h-3.5 w-3.5" />Audiência</TabsTrigger>
                <TabsTrigger value="geografia" className="gap-1.5"><Globe2 className="h-3.5 w-3.5" />Geografia</TabsTrigger>
              </TabsList>

              <TabsContent value="aquisicao" className="pt-4">
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
              </TabsContent>

              <TabsContent value="audiencia" className="pt-4">
                {metrics.audienceByDevice.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados de audiência ainda.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Dispositivo</h4>
                      <BreakdownBars items={metrics.audienceByDevice.map((d) => ({ label: d.device, count: d.count }))} />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Navegador</h4>
                      <BreakdownBars items={metrics.audienceByBrowser.map((b) => ({ label: b.browser, count: b.count }))} />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="geografia" className="pt-4">
                {metrics.geoBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados de geografia ainda.</p>
                ) : (
                  <BreakdownBars items={metrics.geoBreakdown.map((g) => ({ label: g.country, count: g.count }))} />
                )}
              </TabsContent>
            </Tabs>
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
                          <span className="flex items-center gap-1 text-xs font-medium text-[var(--sucesso)]">
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
                              className={`rounded-lg border p-3 text-xs space-y-1.5 ${isLeader ? 'border-[var(--sucesso-borda)] bg-[var(--sucesso-suave)]' : ''}`}
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
                                  ? 'bg-destructive/10 text-destructive'
                                  : s.temperature === 'warm'
                                    ? 'bg-[var(--aviso-suave)] text-[var(--aviso)]'
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

function BreakdownBars({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="text-xs">
          <div className="flex justify-between mb-1 gap-2">
            <span className="text-muted-foreground truncate">{item.label}</span>
            <span className="font-semibold shrink-0">{item.count}</span>
          </div>
          <div className="h-2 rounded bg-muted overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
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

/** Lista de etapas com a nota de conversão e a barra proporcional. */
function ConversaoPorEtapa({
  steps,
  eventos,
}: {
  steps: QuizStep[];
  eventos: { block_id: string | null; session_id: string | null }[];
}) {
  const linhas = calcularConversaoPorEtapa(steps, eventos);
  const maiorVisitantes = Math.max(1, ...linhas.map((l) => l.visitantes));

  if (!steps.length || linhas.every((l) => l.visitantes === 0)) {
    return <p className="text-sm text-muted-foreground">Sem visitas registradas no período.</p>;
  }

  return (
    <div className="max-h-56 space-y-2.5 overflow-auto">
      {linhas.map((l, i) => {
        const step = steps[i];
        const { cor, rotulo } = CORES_DE_FAIXA[l.faixa];
        const semNota = l.taxa === null;
        return (
          <div key={l.stepId} className="text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate text-muted-foreground">
                #{i + 1} {step?.name || `Etapa ${i + 1}`}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums text-muted-foreground">{l.visitantes}</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                  style={semNota ? undefined : { background: `${cor}22`, color: cor }}
                  title={
                    semNota
                      ? i === linhas.length - 1
                        ? 'Última etapa: não existe etapa posterior para medir avanço'
                        : `Precisa de ${MINIMO_PARA_NOTA} visitantes para uma taxa confiável`
                      : `${rotulo} — ${l.avancaram} de ${l.visitantes} avançaram`
                  }
                >
                  {semNota ? '—' : `${Math.round(l.taxa! * 100)}%`}
                </span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-muted">
              <div
                className="h-full"
                style={{
                  width: `${(l.visitantes / maiorVisitantes) * 100}%`,
                  background: semNota ? 'var(--muted-foreground)' : cor,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Formata segundos como "2 min 30 s", que se lê melhor que "150 s". */
function duracao(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  if (m > 0) return `${m} min${s ? ` ${s} s` : ''}`;
  // Abaixo de um segundo não houve tempo a medir — dizer "0 s" seria afirmar
  // uma duração que não existe.
  return s >= 1 ? `${s} s` : '—';
}

/**
 * As seis métricas que o painel do inlead mostra e o nosso não tinha.
 *
 * `Melhor horário` e `Melhor origem` são as que mais valem: entregam a resposta
 * de negócio pronta, em vez de deixar a pessoa deduzir de uma tabela.
 */
function MetricasAvancadas({
  steps,
  eventos,
  submissoes,
}: {
  steps: QuizStep[];
  eventos: EventoBruto[];
  submissoes: SubmissaoBruta[];
}) {
  const m = calcularMetricasAvancadas(steps, eventos, submissoes);

  if (m.taxaDeRejeicao === null) {
    return (
      <>
        <h3 className="mb-1 font-semibold">Desempenho</h3>
        <p className="text-sm text-muted-foreground">
          {m.sessoes} sessão(ões) com medição — são precisas {MINIMO_DE_SESSOES} para estes números
          dizerem alguma coisa. Abaixo disso, qualquer recorte é anedota.
        </p>
      </>
    );
  }

  const celula = (rotulo: string, valor: string, dica?: string) => (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5" title={dica}>
      <div className="text-lg font-bold tabular-nums">{valor}</div>
      <div className="text-[11px] text-muted-foreground">{rotulo}</div>
    </div>
  );

  return (
    <>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="font-semibold">Desempenho</h3>
        <span className="text-[11px] text-muted-foreground">{m.sessoes} sessões</span>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Contado por visitante. Tempo e profundidade usam mediana — uma aba esquecida
        aberta por horas destruiria a média.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {celula('Taxa de rejeição', `${Math.round(m.taxaDeRejeicao * 100)}%`, 'Viram uma etapa só e foram embora')}
        {celula('Tempo médio', m.tempoMedioSegundos !== null ? duracao(m.tempoMedioSegundos) : '—')}
        {celula('Etapas concluídas', m.mediaDeEtapas !== null ? String(m.mediaDeEtapas) : '—')}
        {celula('Profundidade', m.profundidadeMedia !== null ? `${Math.round(m.profundidadeMedia * 100)}%` : '—', 'Até que ponto do funil se chega')}
        {celula(
          'Melhor horário',
          m.melhorHorario ? `${String(m.melhorHorario.hora).padStart(2, '0')}h` : '—',
          m.melhorHorario ? `${m.melhorHorario.conclusoes} conclusão(ões) nessa hora` : undefined,
        )}
        {celula(
          'Melhor origem',
          m.melhorOrigem?.origem ?? '—',
          m.melhorOrigem ? `${Math.round(m.melhorOrigem.taxa * 100)}% de conclusão — escolhida por TAXA, não por volume` : undefined,
        )}
      </div>
    </>
  );
}
