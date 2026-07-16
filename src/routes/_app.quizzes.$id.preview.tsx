import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Monitor, Tablet, Smartphone, ExternalLink, RefreshCw } from 'lucide-react';
import { quizService } from '@/modules/quiz/services/quizService';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/quizzes/$id/preview')({
  component: QuizPreviewPage,
});

type Device = 'desktop' | 'tablet' | 'mobile';

const DEVICE_SIZES: Record<Device, { w: number; h: number; label: string; icon: typeof Monitor }> = {
  desktop: { w: 1280, h: 800, label: 'Desktop', icon: Monitor },
  tablet: { w: 768, h: 1024, label: 'Tablet', icon: Tablet },
  mobile: { w: 390, h: 780, label: 'Mobile', icon: Smartphone },
};

function QuizPreviewPage() {
  const { id } = useParams({ from: '/_app/quizzes/$id/preview' });
  const [device, setDevice] = useState<Device>('desktop');
  const [nonce, setNonce] = useState(0);

  const { data: quiz } = useQuery({
    queryKey: ['quiz', id],
    queryFn: () => quizService.getById(id),
  });

  const slug = quiz?.slug;
  const previewUrl = slug ? `/q/${slug}?preview=1&t=${nonce}` : null;
  const publicUrl = slug ? `${window.location.origin}/q/${slug}` : null;
  const size = DEVICE_SIZES[device];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/quizzes"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Preview</h1>
            <p className="text-sm text-muted-foreground">{quiz?.name ?? 'Carregando...'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-card p-1">
            {(Object.keys(DEVICE_SIZES) as Device[]).map((d) => {
              const Icon = DEVICE_SIZES[d].icon;
              return (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition',
                    device === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {DEVICE_SIZES[d].label}
                </button>
              );
            })}
          </div>
          <Button variant="outline" size="sm" onClick={() => setNonce((n) => n + 1)}>
            <RefreshCw className="h-4 w-4 mr-2" />Recarregar
          </Button>
          {publicUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={publicUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />Abrir
              </a>
            </Button>
          )}
        </div>
      </div>

      <Card className="p-6 bg-muted/30 flex justify-center overflow-auto">
        {previewUrl ? (
          <div
            className="bg-background rounded-lg shadow-lg overflow-hidden transition-all"
            style={{ width: size.w, height: size.h, maxWidth: '100%' }}
          >
            <iframe
              key={nonce}
              src={previewUrl}
              title="Quiz preview"
              className="w-full h-full border-0"
            />
          </div>
        ) : (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {quiz === null ? 'Quiz não encontrado.' : 'Carregando preview...'}
          </div>
        )}
      </Card>
    </div>
  );
}
