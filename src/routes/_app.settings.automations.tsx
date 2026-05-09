import { createFileRoute } from '@tanstack/react-router';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
 import { Zap, Users, Shield, ArrowRightLeft } from 'lucide-react';
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
             Automation Engine Settings
           </CardTitle>
           <CardDescription>Configure global behaviors for your sales and marketing workflows.</CardDescription>
         </CardHeader>
         <CardContent className="space-y-6">
           <div className="space-y-4">
             <div className="flex items-center justify-between">
               <div className="space-y-0.5">
                 <Label>Auto-Enrich Leads</Label>
                 <p className="text-xs text-muted-foreground">Automatically find social profiles and company data for new leads.</p>
               </div>
               <Switch defaultChecked onCheckedChange={() => toast.success('Settings updated')} />
             </div>
             <div className="flex items-center justify-between pt-4 border-t">
               <div className="space-y-0.5">
                 <Label>Strict Deduplication</Label>
                 <p className="text-xs text-muted-foreground">Prevent duplicate leads by matching both email and phone numbers.</p>
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
             Lead Distribution (Round Robin)
           </CardTitle>
           <CardDescription>Automatically assign incoming leads to your sales team members.</CardDescription>
         </CardHeader>
         <CardContent className="space-y-6">
           <div className="space-y-4">
             <div className="flex items-center justify-between">
               <div className="space-y-0.5">
                 <Label>Enable Round Robin</Label>
                 <p className="text-xs text-muted-foreground">Toggle automatic lead assignment for all new incoming leads.</p>
               </div>
               <Switch defaultChecked onCheckedChange={() => toast.success('Lead routing enabled')} />
             </div>
             
             <div className="pt-4 border-t">
               <Label className="text-sm font-medium mb-3 block">Active Sales Queue</Label>
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
