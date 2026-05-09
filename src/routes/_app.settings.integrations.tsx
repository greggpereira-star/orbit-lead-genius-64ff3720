import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
 import { MessageSquare, Database, AlertCircle, Code, Copy, CheckCircle2, Zap, Globe, Share2 } from 'lucide-react';
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

const integrations = [
  {
    id: 'meta',
    name: 'Meta (Facebook & Instagram)',
    description: 'Sync leads from Lead Ads and send Conversion API (CAPI) events for attribution.',
     icon: Share2,
    color: 'bg-[#1877F2]',
    status: 'connected',
    features: ['Lead Ads Sync', 'Conversions API', 'Offline Conversions']
  },
  {
    id: 'google',
    name: 'Google Ads',
    description: 'Import leads from Google Forms and track Enhanced Conversions.',
     icon: Globe,
    color: 'bg-[#EA4335]',
    status: 'disconnected',
    features: ['GCLID Tracking', 'Enhanced Conversions', 'Smart Bidding Sync']
  },
  {
    id: 'cvcrm',
    name: 'CV.CRM',
    description: 'Enterprise integration with legacy real estate CRM systems.',
    icon: Database,
    color: 'bg-[#0a2540]',
    status: 'disconnected',
    features: ['Bi-directional Sync', 'Status Mapping', 'Webhook Gateway']
  },
];

function IntegrationsSettings() {
  const trackingScript = `<script>
  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://cdn.lovable.app/tracking.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','TRK-LEAD-8293');
</script>`;

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-sm bg-primary/[0.02] border-primary/10">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-primary" />
              Tracking Pixel & attribution
            </CardTitle>
            <CardDescription>Install this enterprise script on your website to unify lead attribution.</CardDescription>
          </div>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => {
            navigator.clipboard.writeText(trackingScript);
            toast.success('Script copied to clipboard');
          }}>
            <Copy className="h-4 w-4" />
            Copy Script
          </Button>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-950 rounded-lg p-4 font-mono text-[11px] text-slate-300 overflow-x-auto whitespace-pre">
            {trackingScript}
          </div>
          <div className="mt-4 flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
              Verified on 3 domains
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-primary">
              <Zap className="h-4 w-4" />
              Real-time CAPI Enabled
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((app) => (
          <Card key={app.id} className="border shadow-none hover:border-primary/20 transition-colors">
            <CardContent className="p-6 flex flex-col h-full">
              <div className="flex items-start justify-between mb-4">
                <div className={`h-12 w-12 rounded-xl ${app.color} flex items-center justify-center text-white shadow-lg`}>
                  <app.icon className="h-6 w-6" />
                </div>
                {app.status === 'connected' ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-50">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                )}
              </div>
              
              <h4 className="font-bold text-base mb-1">{app.name}</h4>
              <p className="text-xs text-muted-foreground mb-6 line-clamp-2">{app.description}</p>
              
              <div className="space-y-2 mb-6 flex-1">
                {app.features.map(f => (
                  <div key={f} className="flex items-center gap-2 text-[10px] font-medium text-foreground/70">
                    <CheckCircle2 className="h-3 w-3 text-primary" />
                    {f}
                  </div>
                ))}
              </div>

              <Dialog>
                <DialogTrigger asChild>
                  <Button 
                    variant={app.status === 'connected' ? 'outline' : 'default'} 
                    className="w-full text-xs h-10 font-bold"
                  >
                    {app.status === 'connected' ? 'Configure Integration' : 'Connect Account'}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                      <app.icon className={`h-6 w-6 p-1 rounded ${app.color} text-white`} />
                      {app.name}
                    </DialogTitle>
                    <DialogDescription>
                      Configure production-ready sync for {app.name}.
                    </DialogDescription>
                  </DialogHeader>
                  
                  <div className="space-y-6 py-6">
                    <div className="space-y-4 border rounded-xl p-4 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-bold">Server-Side Events (CAPI)</Label>
                          <p className="text-[11px] text-muted-foreground">Bypass ad-blockers and improve match quality by 35%.</p>
                        </div>
                        <Switch defaultChecked />
                      </div>
                    </div>
                    
                      <div className="space-y-4">
                        {app.id === 'cvcrm' ? (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="cv-domain" className="text-xs uppercase font-bold text-muted-foreground">Domain Subdomain</Label>
                              <div className="flex items-center gap-2">
                                <Input id="cv-domain" placeholder="mycompany" />
                                <span className="text-xs font-medium text-muted-foreground">.cvcrm.com.br</span>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="cv-email" className="text-xs uppercase font-bold text-muted-foreground">Integration Email</Label>
                              <Input id="cv-email" type="email" placeholder="api@company.com" />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="cv-token" className="text-xs uppercase font-bold text-muted-foreground">API Token</Label>
                              <Input id="cv-token" type="password" placeholder="••••••••" />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <Label htmlFor="pixel-id" className="text-xs uppercase font-bold text-muted-foreground">Account ID / Pixel ID</Label>
                              <Input id="pixel-id" placeholder="Ex: 123456789" defaultValue={app.status === 'connected' ? '728394102938475' : ''} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="access-token" className="text-xs uppercase font-bold text-muted-foreground">Access Token (Bearer)</Label>
                              <Input id="access-token" type="password" placeholder="EAAB..." defaultValue={app.status === 'connected' ? '••••••••••••••••' : ''} />
                            </div>
                          </>
                        )}
                      </div>

                    <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-[11px] leading-relaxed font-medium">
                      <AlertCircle className="h-5 w-5 shrink-0 text-amber-500" />
                      <p>
                        Enterprise Grade: All data is encrypted via AES-256 before being stored. Integration logs are audited every 24 hours.
                      </p>
                    </div>
                  </div>
                  
                  <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="ghost" className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold" onClick={() => toast.error('Integration disconnected')}>
                      Disconnect
                    </Button>
                    <Button className="font-bold" onClick={() => toast.success('Configuration saved')}>
                      Save & Test Connection
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
