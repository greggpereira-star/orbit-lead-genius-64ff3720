 import React from 'react';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { 
   Zap, 
   ArrowRight, 
   Mail, 
   MessageSquare, 
   Share2, 
   Plus,
   Bell,
   Settings
 } from 'lucide-react';
  import { Switch } from '@/components/ui/switch';
  import { supabase } from '@/lib/supabase';
  import { useAuth } from '@/core/auth/hooks/useAuth';
  import { toast } from 'sonner';
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
  import { 
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from "@/components/ui/select";
 
 const mockWorkflows = [
   {
     id: '1',
     name: 'New Enterprise Lead Notification',
     trigger: 'Lead Created',
     conditions: ['Industry = SaaS', 'Score > 80'],
     actions: [
       { type: 'slack', label: 'Send Slack to #sales-alerts' },
       { type: 'whatsapp', label: 'Send WhatsApp to Sales Mgr' }
     ],
     active: true
   },
   {
     id: '2',
     name: 'Meta CAPI Conversion Sync',
     trigger: 'Lead Qualified',
     conditions: [],
     actions: [
       { type: 'meta', label: 'Send Purchase Event to Pixel' }
     ],
     active: true
   }
 ];
 
 export function WorkflowEditor() {
   return (
     <div className="space-y-6">
       <div className="flex justify-between items-center">
         <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold">Event-Driven Workflows</h2>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] uppercase font-bold">Enterprise Engine</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">Distributed execution with automatic retries and audit logs.</p>
         </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button className="gap-2 font-bold shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4" />
                Create Automation
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">New Automation Rule</DialogTitle>
                <DialogDescription>Define a trigger and actions to automate your CRM lifecycle.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase font-bold text-muted-foreground">Automation Name</Label>
                  <Input placeholder="Ex: Sync Hot Leads to CV.CRM" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Trigger Event</Label>
                    <Select defaultValue="lead.created">
                      <SelectTrigger>
                        <SelectValue placeholder="Select event" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lead.created">lead.created</SelectItem>
                        <SelectItem value="lead.qualified">lead.qualified</SelectItem>
                        <SelectItem value="pipeline.stage_changed">pipeline.stage_changed</SelectItem>
                        <SelectItem value="integration.failed">integration.failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Priority</Label>
                    <Select defaultValue="normal">
                      <SelectTrigger>
                        <SelectValue placeholder="Priority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High (Immediate)</SelectItem>
                        <SelectItem value="normal">Normal (Queue)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline">Cancel</Button>
                <Button onClick={() => toast.success('Automation rule saved and deployed')}>Deploy Rule</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
       </div>
 
       <div className="space-y-4">
         {mockWorkflows.map((workflow) => (
           <Card key={workflow.id} className="border-none shadow-sm hover:ring-1 hover:ring-primary/20 transition-all">
             <CardContent className="p-0">
               <div className="flex flex-col md:flex-row md:items-center">
                 <div className="p-6 flex-1">
                   <div className="flex items-center gap-3 mb-2">
                     <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                       <Zap className="h-5 w-5 text-amber-500" />
                     </div>
                     <div>
                       <h4 className="font-semibold text-foreground">{workflow.name}</h4>
                       <div className="flex items-center gap-2 mt-0.5">
                         <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tight py-0">Trigger</Badge>
                         <span className="text-xs text-muted-foreground">{workflow.trigger}</span>
                       </div>
                     </div>
                   </div>
                   
                   {workflow.conditions.length > 0 && (
                     <div className="flex flex-wrap gap-2 mt-4 ml-12">
                       {workflow.conditions.map(c => (
                         <Badge key={c} variant="secondary" className="text-[10px] bg-primary/5 text-primary border-primary/10">
                           if {c}
                         </Badge>
                       ))}
                     </div>
                   )}
                 </div>
 
                 <div className="hidden md:flex items-center px-4">
                   <ArrowRight className="h-5 w-5 text-muted-foreground/30" />
                 </div>
 
                 <div className="p-6 md:w-1/3 bg-muted/30 border-t md:border-t-0 md:border-l border-border/50">
                   <div className="space-y-3">
                     {workflow.actions.map((action, i) => (
                       <div key={i} className="flex items-center gap-2 text-sm text-foreground/80">
                         {action.type === 'slack' && <MessageSquare className="h-4 w-4 text-emerald-500" />}
                         {action.type === 'whatsapp' && <Share2 className="h-4 w-4 text-green-500" />}
                         {action.type === 'meta' && <Zap className="h-4 w-4 text-blue-500" />}
                         <span className="font-medium">{action.label}</span>
                       </div>
                     ))}
                   </div>
                 </div>
 
                 <div className="p-6 flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 md:border-l border-border/50">
                   <div className="flex items-center gap-2">
                     <span className="text-xs font-medium text-muted-foreground">
                       {workflow.active ? 'Active' : 'Paused'}
                     </span>
                     <Switch checked={workflow.active} />
                   </div>
                   <Button variant="ghost" size="icon" className="h-9 w-9">
                     <Settings className="h-4 w-4 text-muted-foreground" />
                   </Button>
                 </div>
               </div>
             </CardContent>
           </Card>
         ))}
       </div>
 
       <Card className="border-dashed bg-muted/20">
         <CardContent className="p-12 flex flex-col items-center justify-center text-center">
           <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
             <Bell className="h-6 w-6 text-primary" />
           </div>
           <h3 className="text-lg font-semibold">Want more power?</h3>
           <p className="text-sm text-muted-foreground max-w-sm mt-2 mb-6">
             Connect with Webhooks or Zapier to trigger actions in 5,000+ other apps when a lead is updated.
           </p>
           <Button variant="outline">Browse Integrations</Button>
         </CardContent>
       </Card>
     </div>
   );
 }