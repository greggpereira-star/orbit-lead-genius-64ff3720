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
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, ShieldCheck } from 'lucide-react';
import { quizService } from '../services/quizService';
import { DEFAULT_ACCESS_RULES, type AccessRules } from '../types';

interface Props {
  quizId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccessRulesDialog({ quizId, open, onOpenChange }: Props) {
  const [rules, setRules] = useState<AccessRules>(DEFAULT_ACCESS_RULES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    quizService
      .getAccessRules(quizId)
      .then((r) => {
        if (mounted) setRules(r);
      })
      .catch((e: unknown) => {
        toast.error('Erro ao carregar regras: ' + (e instanceof Error ? e.message : String(e)));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [open, quizId]);

  const toggleDevice = (device: 'mobile' | 'desktop', checked: boolean) => {
    setRules((prev) => {
      const current = new Set(prev.devices ?? []);
      if (checked) current.add(device);
      else current.delete(device);
      return { ...prev, devices: Array.from(current) };
    });
  };

  const handleSave = async () => {
    if (rules.enabled && !rules.fallbackUrl.trim()) {
      toast.error('Informe uma URL de destino para visitantes bloqueados.');
      return;
    }
    setSaving(true);
    try {
      await quizService.saveAccessRules(quizId, rules);
      toast.success('Regras de acesso salvas');
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error('Erro ao salvar: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Regras de acesso
          </DialogTitle>
          <DialogDescription>
            Controle quem vê este quiz. Visitantes que não passarem nos critérios abaixo são
            redirecionados para a URL de destino.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <Label htmlFor="access-rules-enabled" className="text-sm font-medium">
                Ativar regras de acesso
              </Label>
              <Switch
                id="access-rules-enabled"
                checked={rules.enabled}
                onCheckedChange={(checked) => setRules((prev) => ({ ...prev, enabled: checked }))}
              />
            </div>

            <fieldset disabled={!rules.enabled} className="space-y-4 disabled:opacity-40">
              <div className="space-y-1.5">
                <Label htmlFor="utm-source" className="text-xs">UTM Source obrigatório</Label>
                <Input
                  id="utm-source"
                  placeholder="ex: facebook"
                  value={rules.utmSource ?? ''}
                  onChange={(e) => setRules((prev) => ({ ...prev, utmSource: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="utm-campaign" className="text-xs">UTM Campaign obrigatório</Label>
                <Input
                  id="utm-campaign"
                  placeholder="ex: promo-verao"
                  value={rules.utmCampaign ?? ''}
                  onChange={(e) => setRules((prev) => ({ ...prev, utmCampaign: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Dispositivos permitidos</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={(rules.devices ?? []).includes('mobile')}
                      onCheckedChange={(checked) => toggleDevice('mobile', checked === true)}
                    />
                    Mobile
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={(rules.devices ?? []).includes('desktop')}
                      onCheckedChange={(checked) => toggleDevice('desktop', checked === true)}
                    />
                    Desktop
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">Deixe sem marcar para permitir qualquer dispositivo.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="countries" className="text-xs">Países permitidos (códigos ISO, separados por vírgula)</Label>
                <Input
                  id="countries"
                  placeholder="ex: BR, PT"
                  value={(rules.countries ?? []).join(', ')}
                  onChange={(e) =>
                    setRules((prev) => ({
                      ...prev,
                      countries: e.target.value
                        .split(',')
                        .map((c) => c.trim().toUpperCase())
                        .filter(Boolean),
                    }))
                  }
                />
                <p className="text-[11px] text-muted-foreground">Deixe em branco para permitir qualquer país.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fallback-url" className="text-xs">URL de destino (bloqueados)</Label>
                <Input
                  id="fallback-url"
                  placeholder="https://seusite.com.br"
                  value={rules.fallbackUrl}
                  onChange={(e) => setRules((prev) => ({ ...prev, fallbackUrl: e.target.value }))}
                />
              </div>
            </fieldset>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
