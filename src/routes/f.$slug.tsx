import { createFileRoute } from '@tanstack/react-router';
import { PublicFormRenderer } from '@/modules/capture/components/PublicFormRenderer';

export const Route = createFileRoute('/f/$slug')({
  component: PublicFormPage,
});

function PublicFormPage() {
  const { slug } = Route.useParams();
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12 px-4">
      <PublicFormRenderer slug={slug} />
    </div>
  );
}