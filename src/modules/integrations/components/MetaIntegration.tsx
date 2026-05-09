 import { useIntegration } from '../hooks/useIntegration';
 import { Search } from 'lucide-react';
 import { Input } from '@/components/ui/input';
 import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
   const [searchTerm, setSearchTerm] = useState('');

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

                 <div className="relative mb-4">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input 
                     placeholder="Search assets..." 
                     className="pl-9 text-xs h-9"
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                   />
                 </div>

                 <Tabs defaultValue="pages" className="w-full">
                   <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="pages" className="text-[10px] font-bold uppercase">Pages</TabsTrigger>
                    <TabsTrigger value="ad_accounts" className="text-[10px] font-bold uppercase">Ad Accounts</TabsTrigger>
                    <TabsTrigger value="forms" className="text-[10px] font-bold uppercase">Lead Forms</TabsTrigger>
                  </TabsList>
                  
                  {['page', 'ad_account', 'form'].map((type) => (
                    <TabsContent key={type} value={type === 'page' ? 'pages' : type === 'ad_account' ? 'ad_accounts' : 'forms'} className="space-y-4 mt-4">
                      <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {type.replace('_', ' ')}s
                      </Label>
                      
                       {assets.filter(a => a.asset_type === type && a.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 ? (
                        <div className="p-8 text-center border-2 border-dashed rounded-xl bg-muted/10">
                          <p className="text-sm text-muted-foreground">No {type.replace('_', ' ')}s found.</p>
                          <Button variant="link" onClick={discover} className="text-xs font-bold text-primary">Discover</Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                           {assets.filter(a => a.asset_type === type && a.name.toLowerCase().includes(searchTerm.toLowerCase())).map(asset => (
                            <div key={asset.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:border-primary/30 transition-all">
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded bg-muted flex items-center justify-center`}>
                                  <Share2 className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div>
                                  <p className="text-sm font-bold truncate max-w-[200px]">{asset.name}</p>
                                  <div className="flex items-center gap-2">
                                    <p className="text-[9px] font-mono text-muted-foreground">{asset.external_id}</p>
                                    {asset.metadata?.status && (
                                      <Badge variant="outline" className="text-[8px] h-3 px-1">{asset.metadata.status}</Badge>
                                    )}
                                  </div>
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
                    </TabsContent>
                  ))}
                </Tabs>

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
