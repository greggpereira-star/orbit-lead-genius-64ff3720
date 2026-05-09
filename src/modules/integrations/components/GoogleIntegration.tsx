import { useIntegration } from '../hooks/useIntegration';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Globe, RefreshCcw, AlertCircle } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';

export function GoogleIntegration({ companyId }: { companyId: string }) {
  const { connection, assets, isLoading, connect, discover, toggleAsset } = useIntegration(companyId, 'google');

  return (
    <Card className="border shadow-none hover:border-primary/20 transition-colors">
      <CardContent className="p-6 flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="h-12 w-12 rounded-xl bg-[#EA4335] flex items-center justify-center text-white shadow-lg">
            <Globe className="h-6 w-6" />
          </div>
          {connection ? (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">Connected</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Disconnected</Badge>
          )}
        </div>
        
        <h4 className="font-bold text-base mb-1">Google Ads</h4>
        <p className="text-xs text-muted-foreground mb-6 line-clamp-2">Enterprise offline conversion tracking and enhanced attribution.</p>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button variant={connection ? 'outline' : 'default'} className="w-full text-xs h-10 font-bold">
              {connection ? 'Manage Accounts' : 'Connect Google Ads'}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Globe className="h-6 w-6 p-1 rounded bg-[#EA4335] text-white" />
                Google Ads Enterprise Integration
              </DialogTitle>
              <DialogDescription>
                Authorizing via OAuth 2.0. Select your Google Ads accounts below.
              </DialogDescription>
            </DialogHeader>
            
            {!connection ? (
              <div className="py-12 text-center">
                <Button onClick={connect} size="lg" variant="outline" className="gap-2 font-bold border-muted-foreground/20">
                  <Globe className="h-5 w-5 text-[#EA4335]" />
                  Sign in with Google
                </Button>
                <p className="text-[10px] text-muted-foreground mt-4 uppercase font-black tracking-widest text-center">Enterprise API Scopes</p>
              </div>
            ) : (
              <div className="space-y-6 py-4">
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <p className="text-sm font-bold">Connected Google Account</p>
                    <p className="text-xs text-muted-foreground">Status: Active</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={discover} disabled={isLoading} className="gap-2 font-bold">
                    <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Sync Accounts
                  </Button>
                </div>

                <div className="space-y-4">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ad Accounts Discovery</Label>
                  {assets.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed rounded-xl bg-muted/10">
                      <p className="text-sm text-muted-foreground">No Google Ads accounts found.</p>
                      <Button variant="link" onClick={discover} className="text-xs font-bold text-primary">Sync with Google API</Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {assets.map(asset => (
                        <div key={asset.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-[9px] uppercase font-bold">Account</Badge>
                            <div>
                              <p className="text-sm font-bold">{asset.name}</p>
                              <p className="text-[10px] font-mono text-muted-foreground">{asset.external_id}</p>
                            </div>
                          </div>
                          <Switch 
                            checked={asset.is_active} 
                            onCheckedChange={(checked) => toggleAsset(asset.id, checked)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex gap-3">
                  <AlertCircle className="h-5 w-5 text-primary shrink-0" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-primary">Offline Conversions</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
                      LeadFlow will upload conversions (GCLID) automatically to the active accounts above when leads reach selected stages.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter>
               {connection && (
                 <Button variant="ghost" className="text-rose-600 font-bold text-xs hover:bg-rose-50">Revoke Access</Button>
               )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
