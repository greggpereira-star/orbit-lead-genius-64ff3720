import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sparkles } from 'lucide-react';
import { quizService } from '../services/quizService';
import type { QuizTemplate } from '../types';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: 'blank' | 'template';
}

export function QuizCreateDialog({ open, onOpenChange, mode }: Props) {
  const { company, user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [templates, setTemplates] = useState<QuizTemplate[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<QuizTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setNiche('');
    setSelectedTpl(null);
    if (mode === 'template') {
      quizService.listTemplates().then(setTemplates).catch(() => setTemplates([]));
    }
  }, [open, mode]);

  const handleCreate = async () => {
    if (!company?.id || !user?.id) return;
    if (!name.trim()) { toast.error('Informe o nome do quiz'); return; }
    setSaving(true);
    try {
      const quiz = await quizService.create({
        companyId: company.id,
        userId: user.id,
        name: name.trim(),
        niche: niche.trim() || selectedTpl?.niche || undefined,
        templateSchema: selectedTpl?.schema,
      });
      toast.success('Quiz criado');
      onOpenChange(false);
      navigate({ to: '/quizzes/$id/builder', params: { id: quiz.id } });
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === 'object' && e !== null && 'message' in e
            ? String((e as { message: unknown }).message)
            : String(e);
      toast.error('Erro ao criar: ' + msg);
      console.error('QuizCreateDialog: create failed', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'template' ? 'Escolha um template' : 'Novo quiz em branco'}</DialogTitle>
        </DialogHeader>

        {mode === 'template' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
            {templates.map((t) => (
              <Card
                key={t.id}
                className={`p-4 cursor-pointer transition-all ${selectedTpl?.id === t.id ? 'ring-2 ring-primary' : 'hover:border-primary/40'}`}
                onClick={() => { setSelectedTpl(t); if (!name) setName(t.name); }}
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm truncate">{t.name}</h4>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="space-y-3 pt-2">
          <div>
            <Label htmlFor="quiz-name">Nome do quiz</Label>
            <Input id="quiz-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Quiz do Imóvel Ideal" />
          </div>
          <div>
            <Label htmlFor="quiz-niche">Nicho (opcional)</Label>
            <Input id="quiz-niche" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="imobiliário, estética, mentoria..." />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? 'Criando...' : 'Criar quiz'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
