 import { createFileRoute } from '@tanstack/react-router';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { Facebook, Chrome, MessageSquare, Database, AlertCircle } from 'lucide-react';
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
 
 export const Route = createFileRoute('/_app/settings/integrations')({
   component: IntegrationsSettings,
 });
 
 const integrations = [
   {
     id: 'meta',
     name: 'Meta (Facebook & Instagram)',
     description: 'Connect to sync leads from Lead Ads and send Conversion API events.',
     icon: Facebook,
     color: 'bg-blue-600',
     status: 'connected',
   },
   {
     id: 'google',
     name: 'Google Ads',
     description: 'Import leads from Google Forms and track offline conversions.',
     icon: Chrome,
     color: 'bg-red-500',
     status: 'disconnected',
   },
   {
     id: 'whatsapp',
     name: 'WhatsApp Business',
     description: 'Send automated messages and manage conversations.',
     icon: MessageSquare,
     color: 'bg-green-500',
     status: 'disconnected',
   },
   {
     id: 'cvcrm',
     name: 'CV.CRM',
     description: 'Sync leads and stages with your legacy real estate CRM.',
     icon: Database,
     color: 'bg-slate-800',
     status: 'disconnected',
   },
 ];
 
 function IntegrationsSettings() {
   return (
     <div className="space-y-6">
       <Card className="border-none shadow-sm">
         <CardHeader>
           <CardTitle>Connected Apps</CardTitle>
           <CardDescription>Manage your connections with third-party platforms.</CardDescription>
         </CardHeader>
         <CardContent>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             {integrations.map((app) => (
               <Card key={app.id} className="border shadow-none">
                 <CardContent className="p-5 flex flex-col h-full">
                   <div className="flex items-start justify-between mb-4">
                     <div className={`h-10 w-10 rounded-lg ${app.color} flex items-center justify-center text-white`}>
                       <app.icon className="h-5 w-5" />
                     </div>
                     {app.status === 'connected' ? (
                       <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100">
                         Connected
                       </Badge>
                     ) : (
                       <Badge variant="outline">Disconnected</Badge>
                     )}
                   </div>
                   <h4 className="font-semibold text-sm mb-1">{app.name}</h4>
                   <p className="text-xs text-muted-foreground mb-6 flex-1">{app.description}</p>
                   {app.id === 'meta' ? (
                     <Dialog>
                       <DialogTrigger asChild>
                         <Button 
                           variant={app.status === 'connected' ? 'outline' : 'default'} 
                           className="w-full text-xs h-9"
                         >
                           {app.status === 'connected' ? 'Configure' : 'Connect'}
                         </Button>
                       </DialogTrigger>
                       <DialogContent className="sm:max-w-[500px]">
                         <DialogHeader>
                           <DialogTitle className="flex items-center gap-2">
                             <Facebook className="h-5 w-5 text-blue-600" />
                             Meta Integration
                           </DialogTitle>
                           <DialogDescription>
                             Configure your Pixel and Conversions API settings.
                           </DialogDescription>
                         </DialogHeader>
                         <div className="space-y-6 py-4">
                           <div className="space-y-4 border rounded-lg p-4 bg-slate-50">
                             <div className="flex items-center justify-between">
                               <div className="space-y-0.5">
                                 <Label>Conversions API (CAPI)</Label>
                                 <p className="text-xs text-muted-foreground">Improve tracking accuracy with server-side events.</p>
                               </div>
                               <Switch defaultChecked />
                             </div>
                           </div>
                           <div className="space-y-4">
                             <div className="space-y-2">
                               <Label htmlFor="pixel-id">Pixel ID</Label>
                               <Input id="pixel-id" placeholder="Ex: 123456789012345" defaultValue="728394102938475" />
                             </div>
                             <div className="space-y-2">
                               <Label htmlFor="access-token">CAPI Access Token</Label>
                               <Input id="access-token" type="password" placeholder="EAAB..." defaultValue="••••••••••••••••" />
                             </div>
                           </div>
                           <div className="flex items-start gap-3 p-3 rounded-md bg-amber-50 border border-amber-100 text-amber-800 text-xs">
                             <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                             <p>
                               Ensure you have enabled the "Lead" event in your Events Manager and configured the correct permissions.
                             </p>
                           </div>
                         </div>
                         <DialogFooter>
                           <Button variant="outline" onClick={() => {}}>Disconnect</Button>
                           <Button onClick={() => {}}>Save Configuration</Button>
                         </DialogFooter>
                       </DialogContent>
                     </Dialog>
                   ) : (
                     <Button 
                       variant={app.status === 'connected' ? 'outline' : 'default'} 
                       className="w-full text-xs h-9"
                     >
                       {app.status === 'connected' ? 'Configure' : 'Connect'}
                     </Button>
                   )}
                 </CardContent>
               </Card>
             ))}
           </div>
         </CardContent>
       </Card>
     </div>
   );
 }