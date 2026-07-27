import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { cvcrmService } from '@/modules/cvcrm/services/cvcrmService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Database, Code, Copy, CheckCircle2, Zap } from 'lucide-react';
import { MetaIntegration } from '@/modules/integrations/components/MetaIntegration';
import { GoogleIntegration } from '@/modules/integrations/components/GoogleIntegration';
import { PixelSettingsCard } from '@/modules/integrations/components/PixelSettingsCard';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/settings/integrations')({
  component: IntegrationsSettings,
});

const cvCrmInfo = {
  id: 'cvcrm',
  name: 'CV.CRM',
  description: 'One-way enterprise delivery pipeline with UTM enrichment and attribution mapping.',
  icon: Database,
  color: 'bg-[#0a2540]',
  features: ['One-Way Delivery', 'UTM Mapping', 'Lead Enrichment', 'Sync Audit']
};

function IntegrationsSettings() {
  const { company } = useAuth();
  const [cvConfig, setCvConfig] = useState({ cvcrm_base_url: '', api_user: '', api_token: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingLead, setIsTestingLead] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<any>(null);

  useEffect(() => {
    if (company) {
      cvcrmService.getStatus(company.id).then(status => {
        if (status) {
          setIntegrationStatus(status);
          setCvConfig({
            cvcrm_base_url: status.base_url || '',
            api_user: status.integration_user || '',
            api_token: status.encrypted_api_token || ''
          });
        }
      });
    }
  }, [company]);

  const handleSaveCV = async () => {
    if (!company) return;
    setIsSaving(true);
    const result = await cvcrmService.saveConfig(company.id, {
      cvcrm_base_url: cvConfig.cvcrm_base_url,
      api_user: cvConfig.api_user,
      api_token: cvConfig.api_token,
      subdomain: cvConfig.cvcrm_base_url
    });
    if (result.success) {
      const status = await cvcrmService.getStatus(company.id);
      setIntegrationStatus(status);
    }
    setIsSaving(false);
  };

  const handleSendTestLead = async () => {
    if (!company) return;
    setIsTestingLead(true);
    const result = await cvcrmService.sendTestLead(company.id);
    if (result.success) {
      toast.success('Test lead sent successfully! Check your CV.CRM dashboard.');
    } else {
      toast.error('Failed to send test lead: ' + (result.error || 'Unknown error'));
    }
    setIsTestingLead(false);
  };

  return (
    <div className="space-y-6">
      {/* Ocupa o lugar do antigo card "Tracking Pixel & attribution", que
          entregava um <script> vindo de cdn.lovable.app com um id fixo igual
          para todos os clientes e dizia "Verified on 3 domains" em texto
          cravado. Instalar aquilo não rastreava nada.

          Este card é o pixel de verdade: id por empresa, disparo nas páginas
          públicas do produto e Conversions API por um endpoint nosso. */}
      {company && <PixelSettingsCard companyId={company.id} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {company && <MetaIntegration companyId={company.id} />}
        {company && <GoogleIntegration companyId={company.id} />}
        
        <Card className="border shadow-none hover:border-primary/20 transition-colors">
          <CardContent className="p-6 flex flex-col h-full">
            <div className="flex items-start justify-between mb-4">
              <div className={`h-12 w-12 rounded-xl \${cvCrmInfo.color} flex items-center justify-center text-white shadow-lg`}>
                <cvCrmInfo.icon className="h-6 w-6" />
              </div>
              {integrationStatus?.connection_status === 'connected' ? (
                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">Active</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">{integrationStatus?.connection_status || 'Disconnected'}</Badge>
              )}
            </div>
            
            <h4 className="font-bold text-base mb-1">{cvCrmInfo.name}</h4>
            <p className="text-xs text-muted-foreground mb-6 line-clamp-2">{cvCrmInfo.description}</p>
            
            <Dialog>
              <DialogTrigger asChild>
                <Button 
                  variant={integrationStatus?.connection_status === 'connected' ? 'outline' : 'default'} 
                  className="w-full text-xs h-10 font-bold"
                >
                  {integrationStatus?.connection_status === 'connected' ? 'Configure Integration' : 'Connect Account'}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                    <cvCrmInfo.icon className={`h-6 w-6 p-1 rounded \${cvCrmInfo.color} text-white`} />
                    {cvCrmInfo.name}
                  </DialogTitle>
                  <DialogDescription>
                    Configure production-ready sync for {cvCrmInfo.name}.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6 py-6">
                  <div className="space-y-4 border rounded-xl p-4 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold">Automatic Lead Forwarding</Label>
                        <p className="text-[11px] text-muted-foreground">Send leads directly to CV.CRM as soon as they are captured.</p>
                      </div>
                      <Switch checked={integrationStatus?.is_active} />
                    </div>
                  </div>

                  {integrationStatus?.connection_status === 'connected' && (
                    <div className="space-y-4 border rounded-xl p-4 bg-emerald-50/50 border-emerald-100">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-bold text-emerald-900">Test Delivery</Label>
                          <p className="text-[11px] text-emerald-700">Push a sample lead into CV.CRM to verify the full pipeline.</p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 text-[10px] font-bold uppercase tracking-wider bg-white"
                          onClick={handleSendTestLead}
                          disabled={isTestingLead}
                        >
                          {isTestingLead ? 'Sending...' : 'Send Test Lead'}
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="cv-domain" className="text-xs uppercase font-bold text-muted-foreground">Base URL (Ex: mycompany)</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          id="cv-domain" 
                          placeholder="mycompany" 
                          value={cvConfig.cvcrm_base_url}
                          onChange={(e) => setCvConfig({ ...cvConfig, cvcrm_base_url: e.target.value })}
                        />
                        <span className="text-xs font-medium text-muted-foreground">.cvcrm.com.br</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cv-user" className="text-xs uppercase font-bold text-muted-foreground">Integration User</Label>
                      <Input 
                        id="cv-user" 
                        placeholder="api_user" 
                        value={cvConfig.api_user}
                        onChange={(e) => setCvConfig({ ...cvConfig, api_user: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cv-token" className="text-xs uppercase font-bold text-muted-foreground">API Token</Label>
                      <Input 
                        id="cv-token" 
                        type="password" 
                        placeholder="••••••••" 
                        value={cvConfig.api_token}
                        onChange={(e) => setCvConfig({ ...cvConfig, api_token: e.target.value })}
                      />
                    </div>
                  </div>

                  {integrationStatus && (
                    <div className="space-y-2 p-4 rounded-xl border bg-primary/[0.02]">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Integration Health</p>
                      <div className="flex items-center justify-between text-xs">
                        <span>Status:</span>
                        <Badge className={integrationStatus.connection_status === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'}>
                          {integrationStatus.connection_status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>Last Sync:</span>
                        <span className="font-medium">{integrationStatus.last_sync_at ? new Date(integrationStatus.last_sync_at).toLocaleString() : 'Never'}</span>
                      </div>
                    </div>
                  )}
                </div>
                
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold">
                    Disconnect
                  </Button>
                  <Button 
                    className="font-bold" 
                    disabled={isSaving}
                    onClick={handleSaveCV}
                  >
                    {isSaving ? 'Saving...' : 'Save & Test Connection'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
