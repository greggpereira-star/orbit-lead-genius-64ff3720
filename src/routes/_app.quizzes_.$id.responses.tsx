import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Download, Search } from 'lucide-react';
import { quizService } from '@/modules/quiz/services/quizService';
import type { QuizFunnel } from '@/modules/quiz/types';

export const Route = createFileRoute('/_app/quizzes_/$id/responses')({
  component: QuizResponsesPage,
});

type Resposta = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  score: number | null;
  temperature: string | null;
  completed: boolean;
  created_at: string;
};

const COR_DA_TEMPERATURA: Record<string, string> = {
  hot: '#F24822',
  warm: '#FFCD29',
  cold: '#64748b',
};

function QuizResponsesPage() {
  const { id } = useParams({ from: '/_app/quizzes_/$id/responses' });
  const [quiz, setQuiz] = useState<QuizFunnel | null>(null);
  const [linhas, setLinhas] = useState<Resposta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [so, setSo] = useState<'todas' | 'completas' | 'abandonadas'>('todas');
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([quizService.getById(id), quizService.listSubmissions(id, 500)])
      .then(([q, s]) => {
        if (!vivo) return;
        setQuiz(q);
        setLinhas(s);
      })
      .catch(() => toast.error('Não foi possível carregar as respostas.'))
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [id]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (so === 'completas' && !l.completed) return false;
      if (so === 'abandonadas' && l.completed) return false;
      if (!t) return true;
      return [l.name, l.email, l.phone].some((v) => v?.toLowerCase().includes(t));
    });
  }, [linhas, busca, so]);

  const exportar = async () => {
    setExportando(true);
    try {
      const todas = await quizService.getSubmissionsParaExport(id, 90);
      const contato = (a: Record<string, unknown> | null) =>
        (a?._contact ?? {}) as { name?: string; email?: string; phone?: string };
      const rows = [
        ['data', 'nome', 'email', 'telefone', 'score', 'temperatura', 'completo', 'utm_source', 'utm_campaign'],
        ...todas.map((l) => {
          const c = contato(l.answers);
          const t = (l.tracking ?? {}) as Record<string, string>;
          return [l.created_at, c.name ?? '', c.email ?? '', c.phone ?? '', String(l.score ?? ''),
                  l.temperature ?? '', l.status === 'completed' ? 'sim' : 'não', t.utm_source ?? '', t.utm_campaign ?? ''];
        }),
      ];
      const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quiz-${id}-respostas.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${todas.length} resposta(s) exportada(s)`);
    } catch {
      toast.error('Não foi possível exportar agora.');
    } finally {
      setExportando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
          <p className="mt-0.5 text-xs text-muted-foreground">Respostas</p>
        </div>
        <Button size="sm" variant="outline" className="ml-auto gap-2" onClick={() => void exportar()} disabled={exportando}>
          <Download className="h-4 w-4" />{exportando ? 'Exportando…' : 'CSV'}
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone"
            className="h-8 pl-8 text-xs"
          />
        </div>
        {(['todas', 'completas', 'abandonadas'] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={so === f ? 'default' : 'outline'}
            className="h-8 text-xs capitalize"
            onClick={() => setSo(f)}
          >
            {f}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">
          {filtradas.length} de {linhas.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {filtradas.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {linhas.length === 0 ? 'Nenhuma resposta ainda.' : 'Nada encontrado com esse filtro.'}
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left">
                <tr>
                  {['Quando', 'Nome', 'E-mail', 'Telefone', 'Pontos', 'Temperatura', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => (
                  <tr key={l.id} className="border-t hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {new Date(l.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    {/* Resposta sem contato é abandono antes da captura — dizer
                        "—" é mais honesto que deixar a célula vazia. */}
                    <td className="px-3 py-2">{l.name || '—'}</td>
                    <td className="px-3 py-2">{l.email || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{l.phone || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{l.score ?? '—'}</td>
                    <td className="px-3 py-2">
                      {l.temperature ? (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                          style={{
                            background: `${COR_DA_TEMPERATURA[l.temperature] ?? '#64748b'}22`,
                            color: COR_DA_TEMPERATURA[l.temperature] ?? '#64748b',
                          }}
                        >
                          {l.temperature}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">{l.completed ? 'completa' : 'abandonada'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
