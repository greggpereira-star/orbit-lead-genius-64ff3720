import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Rocket, Copy, Check, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { quizService } from '@/modules/quiz/services/quizService';
import type { QuizFunnel } from '@/modules/quiz/types';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/quizzes/$id/publish')({
  component: QuizPublishPage,
});

function QuizPublishPage() {
  const { id } = useParams({ from: '/_app/quizzes/$id/publish' });
  const [quiz, setQuiz] = useState<QuizFunnel | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    quizService.getById(id).then(setQuiz);
  }, [id]);

  const publicUrl = quiz ? `${window.location.origin}/q/${quiz.slug}` : '';
  const embedCode = `<iframe src="${publicUrl}" style="width:100%;height:100vh;border:0"></iframe>`;

  const publish = async () => {
    setPublishing(true);
    try {
      await quizService.publish(id);
      const fresh = await quizService.getById(id);
      setQuiz(fresh);
      toast.success('Quiz publicado com sucesso');
    } catch (e) {
      toast.error('Falha ao publicar', { description: (e as Error).message });
    } finally {
      setPublishing(false);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isPublished = quiz?.status === 'published';

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/quizzes"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Publicação</h1>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm text-muted-foreground">Status</div>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-block h-2 w-2 rounded-full ${isPublished ? 'bg-green-500' : 'bg-amber-500'}`}
              />
              <span className="font-semibold">{isPublished ? 'Publicado' : 'Rascunho'}</span>
            </div>
          </div>
          <Button onClick={publish} disabled={publishing} className="gap-2">
            <Rocket className="h-4 w-4" />
            {publishing ? 'Publicando…' : isPublished ? 'Republicar versão atual' : 'Publicar quiz'}
          </Button>
        </div>
      </Card>

      {isPublished && quiz && (
        <>
          <Card className="p-6 space-y-3">
            <div>
              <h3 className="font-semibold">Link público</h3>
              <p className="text-xs text-muted-foreground">Compartilhe este link direto com seus leads.</p>
            </div>
            <div className="flex gap-2">
              <input readOnly value={publicUrl} className="flex-1 px-3 py-2 rounded-md border bg-muted text-sm font-mono" />
              <Button variant="outline" size="sm" onClick={() => copy(publicUrl)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </Card>

          <Card className="p-6 space-y-3">
            <div>
              <h3 className="font-semibold">Embed em site (iframe)</h3>
              <p className="text-xs text-muted-foreground">Cole este código no HTML da sua página.</p>
            </div>
            <textarea
              readOnly
              value={embedCode}
              rows={3}
              className="w-full px-3 py-2 rounded-md border bg-muted text-sm font-mono resize-none"
            />
            <Button variant="outline" size="sm" onClick={() => copy(embedCode)}>
              <Copy className="h-4 w-4 mr-2" /> Copiar código
            </Button>
          </Card>
        </>
      )}

      {!isPublished && (
        <Card className="p-6 text-sm text-muted-foreground">
          Publique o quiz para gerar link público e código embed.
        </Card>
      )}
    </div>
  );
}
