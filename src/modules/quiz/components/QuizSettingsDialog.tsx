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
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Globe, Webhook, Search, Code } from 'lucide-react';
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
  const [webhookUrl, setWebhookUrl] = useState('');
  const [customHeadScript, setCustomHeadScript] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [seoOgImage, setSeoOgImage] = useState('');

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    quizService
      .getById(quizId)
      .then((quiz) => {
        if (!mounted || !quiz) return;
        const settings = (quiz.settings ?? {}) as Record<string, string>;
        setName(quiz.name);
        setSlug(quiz.slug);
        setPublicSlug(quiz.slug);
        setCustomDomain(settings.custom_domain ?? '');
        setWebhookUrl(settings.webhook_url ?? '');
        setCustomHeadScript(settings.custom_head_script ?? '');
        setSeoTitle(settings.seo_title ?? '');
        setSeoDescription(settings.seo_description ?? '');
        setSeoOgImage(settings.seo_og_image ?? '');
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
        webhookUrl,
        customHeadScript,
        seoTitle,
        seoDescription,
        seoOgImage,
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Configurações do funil</DialogTitle>
          <DialogDescription>Nome, link público, domínio, integrações e SEO deste quiz.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs defaultValue="geral">
            <TabsList>
              <TabsTrigger value="geral" className="gap-1.5"><Globe className="h-3.5 w-3.5" />Geral</TabsTrigger>
              <TabsTrigger value="avancado" className="gap-1.5"><Webhook className="h-3.5 w-3.5" />Avançado</TabsTrigger>
              <TabsTrigger value="seo" className="gap-1.5"><Search className="h-3.5 w-3.5" />SEO</TabsTrigger>
            </TabsList>

            <TabsContent value="geral" className="space-y-4 pt-4">
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
            </TabsContent>

            <TabsContent value="avancado" className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="quiz-settings-webhook" className="flex items-center gap-1.5">
                  <Webhook className="h-3.5 w-3.5" /> Webhook de submissão
                </Label>
                <Input
                  id="quiz-settings-webhook"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://sua-automacao.com/webhook"
                />
                <p className="text-xs text-muted-foreground">
                  Dispara um POST com os dados da resposta sempre que alguém completar este quiz. Enviado diretamente do navegador do visitante — o endpoint precisa aceitar requisições CORS.
                </p>
              </div>

              <div className="space-y-1.5 pt-2 border-t">
                <Label htmlFor="quiz-settings-script" className="flex items-center gap-1.5">
                  <Code className="h-3.5 w-3.5" /> Script customizado
                </Label>
                <Textarea
                  id="quiz-settings-script"
                  value={customHeadScript}
                  onChange={(e) => setCustomHeadScript(e.target.value)}
                  placeholder="<script>...</script>"
                  rows={5}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  Injetado na página pública do quiz (ex: pixel do Meta, Google Tag Manager). Só use scripts em que você confia.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="seo" className="space-y-4 pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="quiz-settings-seo-title">Título (SEO / redes sociais)</Label>
                <Input
                  id="quiz-settings-seo-title"
                  value={seoTitle}
                  onChange={(e) => setSeoTitle(e.target.value)}
                  placeholder={name || 'Quiz interativo'}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quiz-settings-seo-description">Descrição</Label>
                <Textarea
                  id="quiz-settings-seo-description"
                  value={seoDescription}
                  onChange={(e) => setSeoDescription(e.target.value)}
                  placeholder="Responda o quiz e receba seu resultado personalizado."
                  rows={3}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quiz-settings-seo-image">Imagem de compartilhamento (OG image)</Label>
                <Input
                  id="quiz-settings-seo-image"
                  value={seoOgImage}
                  onChange={(e) => setSeoOgImage(e.target.value)}
                  placeholder="https://.../imagem.jpg"
                />
              </div>
            </TabsContent>
          </Tabs>
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
