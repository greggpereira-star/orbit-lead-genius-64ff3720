import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Globe } from 'lucide-react';
import { quizService } from '../services/quizService';
import type { QuizFunnel } from '../types';

interface Props {
  quizId: string;
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (quiz: QuizFunnel) => void;
}

export function QuizSettingsDialog({ quizId, companyId, open, onOpenChange, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [publicSlug, setPublicSlug] = useState('');

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    quizService
      .getById(quizId)
      .then((quiz) => {
        if (!mounted || !quiz) return;
        setName(quiz.name);
        setSlug(quiz.slug);
        setPublicSlug(quiz.slug);
        setCustomDomain((quiz.settings?.custom_domain as string) ?? '');
      })
      .catch((e: unknown) => {
        toast.error('Erro ao carregar configurações: ' + (e instanceof Error ? e.message : String(e)));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [open, quizId]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Informe o nome do quiz');
      return;
    }
    setSaving(true);
    try {
      const updated = await quizService.updateSettings({
        quizId,
        companyId,
        name,
        slug,
        customDomain,
      });
      setSlug(updated.slug);
      setPublicSlug(updated.slug);
      toast.success('Configurações salvas');
      onSaved?.(updated);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error('Erro ao salvar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/q/${publicSlug}` : `/q/${publicSlug}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurações do funil</DialogTitle>
          <DialogDescription>Nome, link público e domínio personalizado deste quiz.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="quiz-settings-name">Nome do funil</Label>
              <Input id="quiz-settings-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Quiz do Imóvel Ideal" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="quiz-settings-slug">Slug do funil</Label>
              <Input id="quiz-settings-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="quiz-do-imovel-ideal" />
              <p className="text-xs text-muted-foreground break-all">
                Prévia da URL: <span className="font-mono">{publicUrl}</span>
              </p>
              <p className="text-xs text-muted-foreground">Se o slug já estiver em uso, um sufixo numérico será adicionado automaticamente.</p>
            </div>

            <div className="space-y-1.5 pt-2 border-t">
              <Label htmlFor="quiz-settings-domain" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Domínio personalizado
              </Label>
              <Input
                id="quiz-settings-domain"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="quiz.suaempresa.com.br"
              />
              {customDomain.trim() && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 space-y-1">
                  <p>Para ativar, aponte um registro <span className="font-mono">CNAME</span> do seu domínio para:</p>
                  <p className="font-mono text-foreground">{typeof window !== 'undefined' ? window.location.host : ''}</p>
                  <p>Depois de configurar o DNS, entre em contato para finalizarmos o certificado SSL do domínio.</p>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
