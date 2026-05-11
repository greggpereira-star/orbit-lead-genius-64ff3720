import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { formService } from '@/modules/capture/services/formService';
import { PublicFormRenderer } from '@/modules/capture/components/PublicFormRenderer';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/embed-form/')({
  component: EmbedFormPage,
});

function EmbedFormPage() {
  const params = Route.useParams();
  const id = (params as any).id;

  const { data: form, isLoading, error } = useQuery({
    queryKey: ['form-embed', id],
    queryFn: () => formService.getFormById(id),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4 text-center">
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-destructive">Formulário não encontrado</h1>
          <p className="text-muted-foreground text-sm">O formulário solicitado pode ter sido removido ou o ID está incorreto.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent p-0">
      <PublicFormRenderer slug={form.slug} />
    </div>
  );
}
