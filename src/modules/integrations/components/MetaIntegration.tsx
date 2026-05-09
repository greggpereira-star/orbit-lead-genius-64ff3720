import { useIntegration } from '../hooks/useIntegration';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Share2, RefreshCcw, AlertCircle } from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';

export function MetaIntegration({ companyId }: { companyId: string }) {
  const { connection, assets, isLoading, connect, discover, toggleAsset } = useIntegration(companyId, 'meta');

  return (
    <Card className="border shadow-none hover:border-primary/20 transition-colors">
      <CardContent className="p-6 flex flex-col h-full">
        <div className="flex items-start justify-between mb-4">
          <div className="h-12 w-12 rounded-xl bg-[#1877F2] flex items-center justify-center text-white shadow-lg">
            <Share2 className="h-6 w-6" />
          </div>
          {connection ? (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">Connected</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Disconnected</Badge>
          )}
        </div>
        
        <h4 className="font-bold text-base mb-1">Meta Lead Ads</h4>
        <p className="text-xs text-muted-foreground mb-6 line-clamp-2">Official enterprise integration with Lead Ads API and CAPI.</p>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button variant={connection ? 'outline' : 'default'} className="w-full text-xs h-10 font-bold">
              {connection ? 'Manage Assets' : 'Connect Meta Business'}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <Share2 className="h-6 w-6 p-1 rounded bg-[#1877F2] text-white" />
                Meta Enterprise Integration
              </DialogTitle>
              <DialogDescription>
                Authorizing via OAuth 2.0. Select your Business Assets below.
              </DialogDescription>
            </DialogHeader>
            
            {!connection ? (
              <div className="py-12 text-center">
                <Button onClick={connect} size="lg" className="bg-[#1877F2] hover:bg-[#1877F2]/90 gap-2 font-bold">
                  <Share2 className="h-5 w-5" />
                  Continue with Facebook
                </Button>
                <p className="text-[10px] text-muted-foreground mt-4 uppercase font-black tracking-widest text-center">Secure OAuth Handshake</p>
              </div>
            ) : (
              <div className="space-y-6 py-4">
                <div className="flex items-center justify-between border-b pb-4">
                  <div>
                    <p className="text-sm font-bold">Connected Account</p>
                    <p className="text-xs text-muted-foreground">Status: Active</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={discover} disabled={isLoading} className="gap-2 font-bold">
                    <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh Assets
                  </Button>
                </div>

                <div className="space-y-4">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground">Discovered Assets</Label>
                  {assets.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed rounded-xl bg-muted/10">
                      <p className="text-sm text-muted-foreground">No assets discovered yet.</p>
                      <Button variant="link" onClick={discover} className="text-xs font-bold text-primary">Click to discover</Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {assets.map(asset => (
                        <div key={asset.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="text-[9px] uppercase font-bold">{asset.asset_type.replace('_', ' ')}</Badge>
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

                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-amber-900">Webhook Syncing</p>
                    <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                      LeadFlow automatically subscribes to webhooks for all active assets. Real-time capture is enabled by default.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter>
               {connection && (
                 <Button variant="ghost" className="text-rose-600 font-bold text-xs hover:bg-rose-50">Disconnect Account</Button>
               )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
