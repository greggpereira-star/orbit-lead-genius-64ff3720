import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Loader2, ShieldCheck, Target } from 'lucide-react';
import { toast } from 'sonner';
import { pixelService, type CompanyPixelSettings } from '../services/pixelService';

/**
 * Configuração de medição da empresa.
 *
 * Vale como padrão para todos os funis; cada quiz pode sobrescrever nas próprias
 * configurações, na aba Avançado.
 */
export function PixelSettingsCard({ companyId }: { companyId: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompanyPixelSettings | null>(null);
  const [metaToken, setMetaToken] = useState('');

  useEffect(() => {
    let alive = true;
    pixelService.getCompanySettings(companyId).then((s) => {
      if (!alive) return;
      setSettings(s);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [companyId]);

  const patch = (p: Partial<CompanyPixelSettings>) =>
    setSettings((s) => (s ? { ...s, ...p } : s));

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    const result = await pixelService.saveCompanySettings(companyId, {
      metaPixelId: settings.metaPixelId,
      metaAccessToken: metaToken,
      metaTestEventCode: settings.metaTestEventCode,
      googleConversionId: settings.googleConversionId,
      googleLeadLabel: settings.googleLeadLabel,
      googleCompleteLabel: settings.googleCompleteLabel,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error('Não foi possível salvar', { description: result.error });
      return;
    }
    // O token não volta do servidor; limpar o campo evita a impressão de que o
    // que está escrito ali é o valor gravado.
    if (metaToken.trim()) {
      setMetaToken('');
      patch({ metaTokenConfigured: true });
    }
    toast.success('Configuração de medição salva');
  };

  return (
    <Card className="border shadow-none">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <Target className="h-4 w-4 text-primary" />
              Pixel e conversões
            </CardTitle>
            <CardDescription className="mt-1">
              Vale para todos os quizzes e formulários desta empresa. Cada funil pode usar um
              pixel próprio nas configurações dele.
            </CardDescription>
          </div>
          {!loading && (settings?.metaPixelId || settings?.googleConversionId) ? (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold shrink-0">
              Medindo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground shrink-0">Sem medição</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading || !settings ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            <section className="space-y-4">
              <h4 className="text-sm font-bold">Meta (Facebook e Instagram)</h4>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pixel-meta-id">ID do Pixel</Label>
                  <Input
                    id="pixel-meta-id"
                    inputMode="numeric"
                    value={settings.metaPixelId}
                    onChange={(e) => patch({ metaPixelId: e.target.value })}
                    placeholder="1234567890123456"
                  />
                  <p className="text-xs text-muted-foreground">
                    Gerenciador de Eventos → Fontes de dados. É o número do pixel, sem letras.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pixel-meta-test">Código de teste (opcional)</Label>
                  <Input
                    id="pixel-meta-test"
                    value={settings.metaTestEventCode}
                    onChange={(e) => patch({ metaTestEventCode: e.target.value })}
                    placeholder="TEST12345"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enquanto preenchido, os eventos aparecem só na aba Testar eventos e não contam
                    para as campanhas. Apague quando terminar de conferir.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pixel-meta-token" className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Token da Conversions API
                  {settings.metaTokenConfigured && (
                    <span className="text-xs font-normal text-emerald-600">• já configurado</span>
                  )}
                </Label>
                <Input
                  id="pixel-meta-token"
                  type="password"
                  autoComplete="off"
                  value={metaToken}
                  onChange={(e) => setMetaToken(e.target.value)}
                  placeholder={settings.metaTokenConfigured ? 'Deixe em branco para manter o token atual' : 'EAAG…'}
                />
                <p className="text-xs text-muted-foreground">
                  Com o token, os eventos também saem pelo nosso servidor — é o que salva a
                  medição de quem usa bloqueador de anúncio. O token fica só no servidor e nunca
                  é devolvido para esta tela.
                </p>
              </div>
            </section>

            <Separator />

            <section className="space-y-4">
              <h4 className="text-sm font-bold">Google Ads</h4>

              <div className="space-y-1.5">
                <Label htmlFor="pixel-google-id">ID de conversão</Label>
                <Input
                  id="pixel-google-id"
                  value={settings.googleConversionId}
                  onChange={(e) => patch({ googleConversionId: e.target.value })}
                  placeholder="AW-123456789"
                />
                <p className="text-xs text-muted-foreground">
                  Google Ads → Objetivos → Conversões. Vem no formato <code>AW-</code> seguido de números.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pixel-google-lead">Rótulo — contato capturado</Label>
                  <Input
                    id="pixel-google-lead"
                    value={settings.googleLeadLabel}
                    onChange={(e) => patch({ googleLeadLabel: e.target.value })}
                    placeholder="AbCdEfGhIj-K1L2M3"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pixel-google-complete">Rótulo — funil concluído</Label>
                  <Input
                    id="pixel-google-complete"
                    value={settings.googleCompleteLabel}
                    onChange={(e) => patch({ googleCompleteLabel: e.target.value })}
                    placeholder="NoPqRsTuVw-X4Y5Z6"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Duas conversões separadas medem coisas diferentes: quem deixou contato e quem foi
                até o fim. Deixar um rótulo em branco desliga aquela conversão.
              </p>
            </section>

            <div className="flex justify-end pt-1">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
