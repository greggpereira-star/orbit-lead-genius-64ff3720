 import { createFileRoute } from '@tanstack/react-router';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Badge } from '@/components/ui/badge';
 import { Facebook, Chrome, MessageSquare, Database } from 'lucide-react';
 
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
                   <Button 
                     variant={app.status === 'connected' ? 'outline' : 'default'} 
                     className="w-full text-xs h-9"
                   >
                     {app.status === 'connected' ? 'Configure' : 'Connect'}
                   </Button>
                 </CardContent>
               </Card>
             ))}
           </div>
         </CardContent>
       </Card>
     </div>
   );
 }