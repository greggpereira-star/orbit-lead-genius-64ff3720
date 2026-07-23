import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Globe, Copy } from 'lucide-react';
import { companyService, type CompanyRecord } from '@/modules/company/services/companyService';
import { SUBDOMAIN_FORMAT, ROOT_DOMAIN } from '@/modules/quiz/lib/tenant';

export const Route = createFileRoute('/_app/settings/company')({
  component: CompanySettings,
});

function CompanySettings() {
  const { company: authCompany } = useAuth();
  const [company, setCompany] = useState<CompanyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subdomain, setSubdomain] = useState('');

  useEffect(() => {
    if (!authCompany?.id) return;
    let mounted = true;
    companyService
      .getById(authCompany.id)
      .then((data) => {
        if (!mounted || !data) return;
        setCompany(data);
        setSubdomain(data.subdomain ?? '');
      })
      .catch((e: unknown) => toast.error('Erro ao carregar empresa: ' + (e instanceof Error ? e.message : String(e))))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [authCompany?.id]);

  const normalized = subdomain.trim().toLowerCase();
  const formatValid = !normalized || SUBDOMAIN_FORMAT.test(normalized);
  const previewHost = normalized ? `${normalized}.${ROOT_DOMAIN}` : null;

  const handleSave = async () => {
    if (!authCompany?.id) return;
    if (!formatValid) {
      toast.error('Formato de subdomínio inválido. Use só letras minúsculas, números e hífen.');
      return;
    }
    setSaving(true);
    try {
      const updated = await companyService.updateSubdomain({ companyId: authCompany.id, subdomain: normalized });
      setCompany(updated);
      toast.success('Configurações salvas');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const copyPreviewLink = () => {
    if (!previewHost) return;
    navigator.clipboard.writeText(`https://${previewHost}`);
    toast.success('Link copiado');
  };

  if (loading) {
    return (
      <Card className="border-none shadow-sm">
        <CardContent className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle>Configurações da empresa</CardTitle>
        <CardDescription>Dados da sua organização e personalização de link.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="companyName">Nome da empresa</Label>
            <Input id="companyName" value={company?.name ?? ''} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug da empresa</Label>
            <Input id="slug" value={company?.slug ?? ''} disabled />
          </div>
        </div>

        <div className="space-y-2 pt-4 border-t">
          <Label htmlFor="subdomain" className="flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Subdomínio personalizado
          </Label>
          <div className="flex items-center gap-2 max-w-md">
            <Input
              id="subdomain"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value)}
              placeholder="sua-empresa"
              className={!formatValid ? 'border-destructive' : undefined}
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">.{ROOT_DOMAIN}</span>
          </div>
          {!formatValid && (
            <p className="text-xs text-destructive">
              Use só letras minúsculas, números e hífen (3 a 30 caracteres, sem começar ou terminar com hífen).
            </p>
          )}
          {previewHost && formatValid && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-2 max-w-md">
              <span className="font-mono flex-1 break-all">https://{previewHost}</span>
              <Button variant="ghost" size="sm" className="h-6 px-2" onClick={copyPreviewLink}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Dá um ar de personalização pros seus clientes sem domínio próprio: os links de quiz publicados
            passam a funcionar também em <span className="font-mono">{normalized || 'sua-empresa'}.{ROOT_DOMAIN}/q/slug</span>.
          </p>
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={saving || !formatValid}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
