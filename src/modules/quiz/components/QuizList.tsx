import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Plus, Trash2, ExternalLink, Loader2 } from 'lucide-react';
import { quizService } from '../services/quizService';
import { useAuth } from '@/core/auth/hooks/useAuth';
import type { QuizFunnel } from '../types';
import { toast } from 'sonner';

interface Props {
  onCreate: () => void;
  onUseTemplate: () => void;
}

export function QuizList({ onCreate, onUseTemplate }: Props) {
  const { company } = useAuth();
  const [items, setItems] = useState<QuizFunnel[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      setItems(await quizService.list(company.id));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Erro ao carregar quizzes: ' + msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [company?.id]);

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este quiz? Esta ação não pode ser desfeita.')) return;
    try {
      await quizService.remove(id);
      toast.success('Quiz excluído');
      void refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Erro ao excluir: ' + msg);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold tracking-tight mb-2">Crie seu primeiro quiz interativo</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
          Capte, qualifique e converta leads com uma experiência premium — mídia rica, lógica condicional e resultados personalizados.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={onCreate} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> Criar Quiz
          </Button>
          <Button variant="outline" onClick={onUseTemplate} className="gap-2">
            <Sparkles className="h-4 w-4" /> Usar Template
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((q) => (
        <Card key={q.id} className="p-5 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0">
              <h3 className="font-bold truncate">{q.name}</h3>
              <p className="text-xs text-muted-foreground truncate">/{q.slug}</p>
            </div>
            <Badge variant={q.status === 'published' ? 'default' : 'secondary'}>
              {q.status === 'published' ? 'Publicado' : q.status === 'draft' ? 'Rascunho' : 'Arquivado'}
            </Badge>
          </div>
          {q.niche && <p className="text-xs text-muted-foreground mb-4">Nicho: {q.niche}</p>}
          <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
            <div><div className="font-bold text-lg">0</div><div className="text-muted-foreground">Leads</div></div>
            <div><div className="font-bold text-lg">—</div><div className="text-muted-foreground">Conclusão</div></div>
            <div><div className="font-bold text-lg">—</div><div className="text-muted-foreground">Conversão</div></div>
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" className="flex-1">
              <Link to="/quizzes/$id/builder" params={{ id: q.id }}>Abrir</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/quizzes/$id/preview" params={{ id: q.id }}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleDelete(q.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
