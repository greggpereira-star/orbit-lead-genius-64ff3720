import { createFileRoute } from '@tanstack/react-router';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
 import { Zap, Users, Shield, ArrowRightLeft, History, CheckCircle2, XCircle, Clock } from 'lucide-react';
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Automações executadas
            </CardTitle>
            <CardDescription>O que rodou, quando rodou e como terminou.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { id: 1, name: 'Sync to CV.CRM', lead: 'John Doe', status: 'success', time: '2 mins ago' },
                { id: 2, name: 'Google Conversion Upload', lead: 'Sarah Miller', status: 'success', time: '15 mins ago' },
                { id: 3, name: 'Meta CAPI Event', lead: 'Robert Wilson', status: 'failed', error: 'Invalid Access Token', time: '1 hour ago' },
                { id: 4, name: 'Slack Notification', lead: 'Emma Davis', status: 'success', time: '2 hours ago' },
              ].map((run) => (
                <div key={run.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/10">
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${run.status === 'success' ? 'bg-[var(--sucesso-suave)] text-[var(--sucesso)]' : 'bg-destructive/10 text-destructive'}`}>
                      {run.status === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{run.name}</p>
                      <p className="text-[10px] text-muted-foreground">Lead: {run.lead} • {run.status === 'failed' ? <span className="text-destructive font-semibold">{run.error}</span> : 'Completed'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {run.time}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/settings/automations')({
  component: AutomationSettings,
});

 function AutomationSettings() {
   return (
     <div className="space-y-6">
       <Card className="border-none shadow-sm">
         <CardHeader>
           <CardTitle className="flex items-center gap-2">
             <Zap className="h-5 w-5 text-primary" />
             Regras das automações
           </CardTitle>
           <CardDescription>Valem para todos os fluxos de venda e marketing.</CardDescription>
         </CardHeader>
         <CardContent className="space-y-6">
           <div className="space-y-4">
             <div className="flex items-center justify-between">
               <div className="space-y-0.5">
                 <Label>Completar dados do lead</Label>
                 <p className="text-xs text-muted-foreground">Busca perfis sociais e dados da empresa a cada lead novo.</p>
               </div>
               <Switch defaultChecked onCheckedChange={() => toast.success('Settings updated')} />
             </div>
             <div className="flex items-center justify-between pt-4 border-t">
               <div className="space-y-0.5">
                 <Label>Evitar lead repetido</Label>
                 <p className="text-xs text-muted-foreground">Considera repetido quando e-mail E telefone batem.</p>
               </div>
               <Switch defaultChecked onCheckedChange={() => toast.success('Settings updated')} />
             </div>
           </div>
         </CardContent>
       </Card>
 
       <Card className="border-none shadow-sm">
         <CardHeader>
           <CardTitle className="flex items-center gap-2">
             <ArrowRightLeft className="h-5 w-5 text-primary" />
             Distribuição de leads (rodízio)
           </CardTitle>
           <CardDescription>Cada lead que entra vai para um vendedor, em rodízio.</CardDescription>
         </CardHeader>
         <CardContent className="space-y-6">
           <div className="space-y-4">
             <div className="flex items-center justify-between">
               <div className="space-y-0.5">
                 <Label>Ativar rodízio</Label>
                 <p className="text-xs text-muted-foreground">Vale para todo lead que entrar a partir de agora.</p>
               </div>
               <Switch defaultChecked onCheckedChange={() => toast.success('Lead routing enabled')} />
             </div>
             
             <div className="pt-4 border-t">
               <Label className="text-sm font-medium mb-3 block">Vendedores no rodízio</Label>
               <div className="space-y-3">
                 {[
                   { name: 'Alice Johnson', weight: 'High', status: 'Active' },
                   { name: 'Bob Smith', weight: 'Standard', status: 'Active' },
                   { name: 'Charlie Davis', weight: 'Standard', status: 'Away' },
                 ].map((member) => (
                   <div key={member.name} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                     <div className="flex items-center gap-3">
                       <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                         {member.name.split(' ').map(n => n[0]).join('')}
                       </div>
                       <div>
                         <p className="text-sm font-medium">{member.name}</p>
                         <p className="text-[10px] text-muted-foreground">Weight: {member.weight}</p>
                       </div>
                     </div>
                     <Badge variant={member.status === 'Active' ? 'secondary' : 'outline'} className="text-[10px]">
                       {member.status}
                     </Badge>
                   </div>
                 ))}
               </div>
             </div>
           </div>
         </CardContent>
       </Card>
     </div>
   );
 }
