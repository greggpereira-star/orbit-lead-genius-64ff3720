 import { createFileRoute } from '@tanstack/react-router';
 import { Button } from '@/components/ui/button';
 import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
 import { 
   ArrowLeft, 
   Mail, 
   Phone, 
   MapPin, 
   Calendar, 
   Activity, 
   MessageCircle,
   History,
   Tags,
   MoreVertical,
   Edit2
 } from 'lucide-react';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
 
 export const Route = createFileRoute('/_app/leads/$id')({
   component: LeadDetailsPage,
 });
 
 function LeadDetailsPage() {
   const { id } = Route.useParams();
 
   // Mock lead data
   const lead = {
     id,
     name: 'John Doe',
     email: 'john@acme.com',
     phone: '+55 11 99999-9999',
     city: 'São Paulo, SP',
     status: 'qualified',
     temperature: 'hot',
     score: 85,
     company: 'Acme Corp',
     role: 'Head of Sales',
     created_at: '2024-03-20 14:30',
     source: 'Google Ads',
     campaign: 'Search_Enterprise_BR',
     events: [
       { id: 1, type: 'form_submission', title: 'Form Submitted', description: 'Enterprise Inquiry Form', date: '2 hours ago' },
       { id: 2, type: 'status_change', title: 'Status Changed', description: 'Moved from New to Qualified', date: '4 hours ago' },
       { id: 3, type: 'page_view', title: 'Pricing Page Viewed', description: 'Duration: 4m 32s', date: '1 day ago' },
     ],
     metadata: {
       utm_source: 'google',
       utm_medium: 'cpc',
       utm_campaign: 'Search_Enterprise_BR',
       gclid: 'aw-123456789',
     }
   };
 
   return (
     <div className="space-y-6">
       <div className="flex items-center gap-4">
         <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
           <ArrowLeft className="h-4 w-4" />
         </Button>
         <div className="flex-1">
           <div className="flex items-center gap-3">
             <h1 className="text-2xl font-bold tracking-tight">{lead.name}</h1>
             <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 capitalize">
               {lead.status}
             </Badge>
             <Badge variant="outline" className="capitalize text-rose-600 bg-rose-50 border-rose-100">
               {lead.temperature}
             </Badge>
           </div>
           <p className="text-muted-foreground text-sm">{lead.role} at {lead.company}</p>
         </div>
         <div className="flex items-center gap-2">
           <Button variant="outline" size="sm" className="gap-2">
             <Edit2 className="h-4 w-4" />
             Edit
           </Button>
           <Button size="sm" className="gap-2">
             <MessageCircle className="h-4 w-4" />
             WhatsApp
           </Button>
           <Button variant="ghost" size="icon">
             <MoreVertical className="h-4 w-4" />
           </Button>
         </div>
       </div>
 
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-1 space-y-6">
           <Card className="border-none shadow-sm">
             <CardHeader>
               <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                 Contact Information
               </CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
               <div className="flex items-center gap-3 text-sm">
                 <Mail className="h-4 w-4 text-muted-foreground" />
                 <span className="text-foreground">{lead.email}</span>
               </div>
               <div className="flex items-center gap-3 text-sm">
                 <Phone className="h-4 w-4 text-muted-foreground" />
                 <span className="text-foreground">{lead.phone}</span>
               </div>
               <div className="flex items-center gap-3 text-sm">
                 <MapPin className="h-4 w-4 text-muted-foreground" />
                 <span className="text-foreground">{lead.city}</span>
               </div>
               <div className="flex items-center gap-3 text-sm">
                 <Calendar className="h-4 w-4 text-muted-foreground" />
                 <span className="text-foreground">Created on {lead.created_at}</span>
               </div>
             </CardContent>
           </Card>
 
           <Card className="border-none shadow-sm">
             <CardHeader>
               <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                 Lead Intelligence
               </CardTitle>
             </CardHeader>
             <CardContent className="space-y-6">
               <div>
                 <div className="flex justify-between items-end mb-2">
                   <span className="text-sm font-medium">Lead Score</span>
                   <span className="text-2xl font-bold text-primary">{lead.score}</span>
                 </div>
                 <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                   <div 
                     className="h-full bg-primary" 
                     style={{ width: `${lead.score}%` }}
                   />
                 </div>
               </div>
 
               <div className="space-y-3">
                 <div className="flex justify-between text-xs">
                   <span className="text-muted-foreground">Source</span>
                   <span className="font-medium">{lead.source}</span>
                 </div>
                 <div className="flex justify-between text-xs">
                   <span className="text-muted-foreground">Campaign</span>
                   <span className="font-medium truncate ml-4 text-right">{lead.campaign}</span>
                 </div>
                 <div className="flex justify-between text-xs">
                   <span className="text-muted-foreground">GCLID</span>
                   <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">
                     {lead.metadata.gclid}
                   </span>
                 </div>
               </div>
             </CardContent>
           </Card>
         </div>
 
         <div className="lg:col-span-2 space-y-6">
           <Tabs defaultValue="activity" className="w-full">
             <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-auto p-0 gap-6">
               <TabsTrigger 
                 value="activity" 
                 className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 pb-3 h-auto"
               >
                 <Activity className="h-4 w-4 mr-2" />
                 Activity Timeline
               </TabsTrigger>
               <TabsTrigger 
                 value="history" 
                 className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 pb-3 h-auto"
               >
                 <History className="h-4 w-4 mr-2" />
                 Status History
               </TabsTrigger>
               <TabsTrigger 
                 value="tags" 
                 className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-0 pb-3 h-auto"
               >
                 <Tags className="h-4 w-4 mr-2" />
                 Tags & Labels
               </TabsTrigger>
             </TabsList>
             <TabsContent value="activity" className="pt-6">
               <div className="space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-muted before:via-muted before:to-transparent">
                 {lead.events.map((event) => (
                   <div key={event.id} className="relative flex items-start gap-6">
                     <div className="absolute left-0 flex items-center justify-center w-10 h-10 rounded-full bg-background border shadow-sm ring-8 ring-background">
                       <Activity className="h-4 w-4 text-primary" />
                     </div>
                     <div className="flex-1 ml-10">
                       <div className="flex items-center justify-between">
                         <h4 className="text-sm font-semibold">{event.title}</h4>
                         <span className="text-xs text-muted-foreground">{event.date}</span>
                       </div>
                       <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                     </div>
                   </div>
                 ))}
               </div>
             </TabsContent>
             <TabsContent value="history" className="pt-6">
                <p className="text-sm text-muted-foreground italic">No history available yet.</p>
             </TabsContent>
             <TabsContent value="tags" className="pt-6">
               <div className="flex flex-wrap gap-2">
                 <Badge variant="outline">Enterprise</Badge>
                 <Badge variant="outline">Priority</Badge>
                 <Badge variant="outline">Brazil</Badge>
                 <Button variant="ghost" size="sm" className="h-6 px-2 text-xs border border-dashed">
                   + Add Tag
                 </Button>
               </div>
             </TabsContent>
           </Tabs>
         </div>
       </div>
     </div>
   );
 }