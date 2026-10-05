import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { formService } from '@/modules/capture/services/formService';
import { PublicFormRenderer } from '@/modules/capture/components/PublicFormRenderer';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/embed-form/$id')({
  component: EmbedFormPage,
});

function EmbedFormPage() {
  const { id } = Route.useParams();

  const { data: form, isLoading, error } = useQuery({
    queryKey: ['form-embed', id],
    // `getFormById` lê a tabela `forms` direto e o visitante é anônimo —
    // `permission denied`. O caminho público vai pela função que roda como dono.
    queryFn: () => formService.getPublicForm(id),
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

  /* No modal a altura é limitada pelo iframe: a página precisa ocupar
     exatamente essa altura para a barra de ação ficar presa no rodapé e só os
     campos rolarem. Embutido na página, a altura segue o conteúdo. */
  const noModal =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('lf_modo') === 'modal';

  return (
    <div className={noModal ? 'h-[100dvh] overflow-hidden bg-transparent' : 'bg-transparent p-0 overflow-hidden'}>
      <PublicFormRenderer slug={form.slug || id} />
    </div>
  );
}
