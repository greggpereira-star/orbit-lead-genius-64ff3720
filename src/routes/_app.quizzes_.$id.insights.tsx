import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Loader2, Sparkles, CircleAlert, TriangleAlert, Lightbulb, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { quizService } from '@/modules/quiz/services/quizService';
import { getSteps } from '@/modules/quiz/lib/steps';
import { calcularConversaoPorEtapa } from '@/modules/quiz/lib/stepConversion';
import { analisarFunil, type Achado, type Severidade } from '@/modules/quiz/lib/analisarFunil';
import { DEFAULT_DESIGN } from '@/modules/quiz/design-presets';
import type { QuizFunnel, QuizSchema, ScoreTier } from '@/modules/quiz/types';

export const Route = createFileRoute('/_app/quizzes_/$id/insights')({
  component: QuizInsightsPage,
});

const ESTILO: Record<Severidade, { rotulo: string; cor: string; Icone: typeof CircleAlert }> = {
  critico: { rotulo: 'Crítico', cor: '#F24822', Icone: CircleAlert },
  atencao: { rotulo: 'Atenção', cor: '#FFCD29', Icone: TriangleAlert },
  sugestao: { rotulo: 'Sugestão', cor: '#64748b', Icone: Lightbulb },
};

function QuizInsightsPage() {
  const { id } = useParams({ from: '/_app/quizzes_/$id/insights' });
  const { company } = useAuth();
  const [quiz, setQuiz] = useState<QuizFunnel | null>(null);
  const [schema, setSchema] = useState<QuizSchema>({ blocks: [], design: DEFAULT_DESIGN, results: [] });
  const [eventos, setEventos] = useState<{ block_id: string | null; session_id: string | null }[]>([]);
  const [metricas, setMetricas] = useState<{ starts: number; completions: number; leadsCaptured: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [geradoEm, setGeradoEm] = useState<Date | null>(null);

  const carregar = async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    try {
      const [q, s, ev, m] = await Promise.all([
        quizService.getById(id),
        quizService.getLatestSchema(id),
        quizService.getStepViewEvents(id, 30),
        quizService.getMetrics(id, 30),
      ]);
      setQuiz(q);
      setSchema({ ...s, steps: getSteps(s) });
      setEventos(ev);
      setMetricas({ starts: m.starts, completions: m.completions, leadsCaptured: m.leadsCaptured });
      setGeradoEm(new Date());
    } catch (e) {
      console.error('Erro ao carregar a análise', e);
      toast.error('Não foi possível carregar a análise agora.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id, company?.id]);

  const analise = useMemo(() => {
    const steps = getSteps(schema);
    return analisarFunil({
      schema,
      steps,
      conversao: calcularConversaoPorEtapa(steps, eventos),
      tiers: (quiz?.settings?.score_tiers as ScoreTier[] | undefined) ?? [],
      metricas: metricas ?? undefined,
    });
  }, [schema, eventos, metricas, quiz]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const criticos = analise.problemas.filter((p) => p.severidade === 'critico').length;

  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/quizzes/$id/builder" params={{ id }}>
            <ArrowLeft className="mr-2 h-4 w-4" />Voltar ao Builder
          </Link>
        </Button>
        <div className="border-l pl-3">
          <h1 className="text-sm font-bold leading-none">{quiz?.name ?? 'Quiz'}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Análise de conversão</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {geradoEm && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Gerada {geradoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => void carregar(true)}>
            <RefreshCw className="h-3.5 w-3.5" />Nova análise
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-5">
          <Card className="flex flex-wrap items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">
                {analise.problemas.length === 0
                  ? 'Nada a corrigir por aqui'
                  : `${analise.problemas.length} ponto${analise.problemas.length > 1 ? 's' : ''} para olhar`}
              </h2>
              <p className="text-xs text-muted-foreground">
                {criticos > 0
                  ? `${criticos} crítico(s) — esses custam lead agora.`
                  : 'Nenhum problema crítico encontrado.'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tabular-nums">{analise.visitantes}</div>
              <div className="text-[11px] text-muted-foreground">visitantes (30d)</div>
            </div>
          </Card>

          {/* Toda conclusão daqui sai de uma contagem; sem isso explícito, a
              tela pareceria opinião de software. */}
          <p className="text-[11px] text-muted-foreground">
            Cada ponto abaixo cita o número que o sustenta. Nada é inferido.
          </p>

          {analise.problemas.map((p) => (
            <CartaoDeAchado key={p.id} achado={p} />
          ))}

          {analise.funcionando.length > 0 && (
            <Card className="space-y-2.5 p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <CheckCircle2 className="h-4 w-4 text-[var(--sucesso,#14AE5C)]" />
                O que está funcionando
              </h3>
              <ul className="space-y-1.5">
                {analise.funcionando.map((f, i) => (
                  <li key={i} className="text-xs text-muted-foreground">• {f}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CartaoDeAchado({ achado }: { achado: Achado }) {
  const { rotulo, cor, Icone } = ESTILO[achado.severidade];
  return (
    <Card className="space-y-2.5 p-5" style={{ borderLeft: `3px solid ${cor}` }}>
      <div className="flex items-start gap-2.5">
        <Icone className="mt-0.5 h-4 w-4 shrink-0" style={{ color: cor }} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold">{achado.titulo}</h3>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: `${cor}22`, color: cor }}
            >
              {rotulo}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{achado.detalhe}</p>
        </div>
      </div>
      <div className="rounded-lg bg-muted/50 px-3 py-2">
        <p className="text-xs"><span className="font-semibold">O que fazer: </span>{achado.acao}</p>
      </div>
    </Card>
  );
}
