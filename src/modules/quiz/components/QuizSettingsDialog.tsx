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
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2, Globe, Webhook, Search, Code, Sparkles, Timer, Plus, Trash2,
  CheckCircle2, Gift, Users, Star, Flame, Bell,
} from 'lucide-react';
import { quizService } from '../services/quizService';
import type { QuizFunnel, SocialProofSettings, SocialProofMessage, SocialProofIcon, UrgencyBarSettings } from '../types';
import { DEFAULT_SOCIAL_PROOF, DEFAULT_URGENCY_BAR } from '../types';

const SOCIAL_PROOF_ICONS: { value: SocialProofIcon; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'check', label: 'Check', icon: CheckCircle2 },
  { value: 'gift', label: 'Presente', icon: Gift },
  { value: 'users', label: 'Pessoas', icon: Users },
  { value: 'star', label: 'Estrela', icon: Star },
  { value: 'fire', label: 'Fogo', icon: Flame },
  { value: 'bell', label: 'Sino', icon: Bell },
];

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
  const [socialProof, setSocialProof] = useState<SocialProofSettings>(DEFAULT_SOCIAL_PROOF);
  const [urgencyBar, setUrgencyBar] = useState<UrgencyBarSettings>(DEFAULT_URGENCY_BAR);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    quizService
      .getById(quizId)
      .then((quiz) => {
        if (!mounted || !quiz) return;
        const settings = (quiz.settings ?? {}) as Record<string, unknown>;
        setName(quiz.name);
        setSlug(quiz.slug);
        setPublicSlug(quiz.slug);
        setCustomDomain((settings.custom_domain as string) ?? '');
        setWebhookUrl((settings.webhook_url as string) ?? '');
        setCustomHeadScript((settings.custom_head_script as string) ?? '');
        setSeoTitle((settings.seo_title as string) ?? '');
        setSeoDescription((settings.seo_description as string) ?? '');
        setSeoOgImage((settings.seo_og_image as string) ?? '');
        setSocialProof({ ...DEFAULT_SOCIAL_PROOF, ...(settings.social_proof as Partial<SocialProofSettings> | undefined) });
        setUrgencyBar({ ...DEFAULT_URGENCY_BAR, ...(settings.urgency_bar as Partial<UrgencyBarSettings> | undefined) });
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
        socialProof,
        urgencyBar,
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
              <TabsTrigger value="engajamento" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" />Engajamento</TabsTrigger>
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

            <TabsContent value="engajamento" className="space-y-6 pt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-sm font-semibold">
                    <Timer className="h-3.5 w-3.5" /> Barra de urgência
                  </Label>
                  <Switch
                    checked={urgencyBar.enabled}
                    onCheckedChange={(checked) => setUrgencyBar((u) => ({ ...u, enabled: checked }))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Contagem regressiva fixa no topo do quiz, visível em todas as etapas. Cada visitante tem seu
                  próprio cronômetro (evergreen) a partir do momento em que abre o quiz.
                </p>
                {urgencyBar.enabled && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="quiz-urgency-label" className="text-xs">Texto</Label>
                      <Input
                        id="quiz-urgency-label"
                        value={urgencyBar.label}
                        onChange={(e) => setUrgencyBar((u) => ({ ...u, label: e.target.value }))}
                        placeholder="Oferta especial expira em:"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Duração: {urgencyBar.minutes} min</Label>
                      <Slider
                        min={1}
                        max={60}
                        step={1}
                        value={[urgencyBar.minutes]}
                        onValueChange={([v]) => setUrgencyBar((u) => ({ ...u, minutes: v }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Quando chegar a zero</Label>
                      <Select
                        value={urgencyBar.onExpire}
                        onValueChange={(v) => setUrgencyBar((u) => ({ ...u, onExpire: v as UrgencyBarSettings['onExpire'] }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="restart">Reiniciar (recomendado)</SelectItem>
                          <SelectItem value="freeze">Congelar em 00:00</SelectItem>
                          <SelectItem value="hide">Esconder a barra</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between pt-2">
                  <Label className="flex items-center gap-1.5 text-sm font-semibold">
                    <Sparkles className="h-3.5 w-3.5" /> Prova social flutuante
                  </Label>
                  <Switch
                    checked={socialProof.enabled}
                    onCheckedChange={(checked) => setSocialProof((s) => ({ ...s, enabled: checked }))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Notificações flutuantes que aparecem por cima do quiz e somem sozinhas, sem interromper o
                  visitante — mostram mensagens que você define, em rodízio.
                </p>
                {socialProof.enabled && (
                  <div className="space-y-4 rounded-lg border p-3">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Posição</Label>
                        <Select
                          value={socialProof.position}
                          onValueChange={(v) => setSocialProof((s) => ({ ...s, position: v as SocialProofSettings['position'] }))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bottom-left">Inferior esq.</SelectItem>
                            <SelectItem value="bottom-center">Inferior centro</SelectItem>
                            <SelectItem value="bottom-right">Inferior dir.</SelectItem>
                            <SelectItem value="top-center">Superior centro</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Início: {socialProof.startDelaySeconds}s</Label>
                        <Slider
                          min={0}
                          max={30}
                          step={1}
                          value={[socialProof.startDelaySeconds]}
                          onValueChange={([v]) => setSocialProof((s) => ({ ...s, startDelaySeconds: v }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Intervalo: {socialProof.intervalSeconds}s</Label>
                        <Slider
                          min={5}
                          max={60}
                          step={1}
                          value={[socialProof.intervalSeconds]}
                          onValueChange={([v]) => setSocialProof((s) => ({ ...s, intervalSeconds: v }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Mensagens (aparecem em rodízio)</Label>
                      <SocialProofMessagesEditor
                        messages={socialProof.messages}
                        onChange={(messages) => setSocialProof((s) => ({ ...s, messages }))}
                      />
                    </div>
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

function SocialProofMessagesEditor({
  messages,
  onChange,
}: {
  messages: SocialProofMessage[];
  onChange: (messages: SocialProofMessage[]) => void;
}) {
  return (
    <div className="space-y-2">
      {messages.map((msg, i) => {
        const IconComp = SOCIAL_PROOF_ICONS.find((o) => o.value === msg.icon)?.icon ?? CheckCircle2;
        return (
          <div key={msg.id} className="rounded-lg border p-2.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                  <IconComp className="h-3 w-3 text-primary" />
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground">Mensagem {i + 1}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange(messages.filter((m) => m.id !== msg.id))}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <div className="flex gap-1.5">
              <Select
                value={msg.icon}
                onValueChange={(v) => {
                  const next = [...messages];
                  next[i] = { ...msg, icon: v as SocialProofIcon };
                  onChange(next);
                }}
              >
                <SelectTrigger className="w-28 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOCIAL_PROOF_ICONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-1.5"><opt.icon className="h-3.5 w-3.5" />{opt.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Título — ex: Ana acabou de se inscrever"
                value={msg.title}
                onChange={(e) => {
                  const next = [...messages];
                  next[i] = { ...msg, title: e.target.value };
                  onChange(next);
                }}
              />
            </div>
            <Input
              placeholder="Texto secundário (opcional)"
              value={msg.body ?? ''}
              onChange={(e) => {
                const next = [...messages];
                next[i] = { ...msg, body: e.target.value };
                onChange(next);
              }}
            />
          </div>
        );
      })}
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2"
        onClick={() =>
          onChange([
            ...messages,
            { id: crypto.randomUUID(), icon: 'check', title: '', body: '' },
          ])
        }
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar mensagem
      </Button>
      {messages.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Nenhuma mensagem ainda. Adicione ao menos uma pra ativar o rodízio.
        </p>
      )}
    </div>
  );
}
