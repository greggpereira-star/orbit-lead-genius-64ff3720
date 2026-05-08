 import { createFileRoute } from '@tanstack/react-router';
 import { useState, useEffect } from 'react';
 import { supabase } from '@/lib/supabase';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 import { toast } from 'sonner';
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
   Edit2,
   Target
 } from 'lucide-react';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
 import { LeadScoreCard } from '@/modules/ai/components/LeadScoreCard';
 
 export const Route = createFileRoute('/_app/leads/$id')({
   component: LeadDetailsPage,
 });
 
 function LeadDetailsPage() {
   const { id } = Route.useParams();
   const { company } = useAuth();
   const [lead, setLead] = useState<any>(null);
   const [events, setEvents] = useState<any[]>([]);
   const [isLoading, setIsLoading] = useState(true);
 
   useEffect(() => {
     if (company && id) {
       fetchLeadDetails();
     }
   }, [company, id]);
 
   const fetchLeadDetails = async () => {
     setIsLoading(true);
     try {
       const { data: leadData, error: leadError } = await supabase
         .from('leads')
         .select('*')
         .eq('id', id)
         .single();
 
       if (leadError) throw leadError;
       setLead(leadData);
 
       const { data: eventsData, error: eventsError } = await supabase
         .from('lead_events')
         .select('*')
         .eq('lead_id', id)
         .order('created_at', { ascending: false });
 
       if (eventsError) throw eventsError;
       setEvents(eventsData);
     } catch (error) {
       console.error('Error fetching lead details:', error);
       toast.error('Failed to load lead details');
     } finally {
       setIsLoading(false);
     }
   };
 
   if (isLoading) return <div className="p-8 text-center">Loading lead details...</div>;
   if (!lead) return <div className="p-8 text-center text-rose-500 font-bold">Lead not found</div>;
 
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
             <Badge 
               variant="outline" 
               className={`capitalize ${
                 lead.temperature === 'hot' ? 'text-rose-600 bg-rose-50 border-rose-100' : 
                 lead.temperature === 'warm' ? 'text-amber-600 bg-amber-50 border-amber-100' : 
                 'text-blue-600 bg-blue-50 border-blue-100'
               }`}
             >
               {lead.temperature || 'cold'}
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
 
            <LeadScoreCard leadData={lead} />

            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Marketing Attribution
                </CardTitle>
              </CardHeader>
             <CardContent className="space-y-3">
               <div className="flex justify-between text-xs">
                 <span className="text-muted-foreground">Source</span>
                 <Badge variant="secondary" className="text-[10px] py-0">{lead.utm_source || lead.source || 'Direct'}</Badge>
               </div>
               <div className="flex justify-between text-xs">
                 <span className="text-muted-foreground">Campaign</span>
                 <span className="font-medium truncate ml-4 text-right text-foreground/80">{lead.utm_campaign || 'None'}</span>
               </div>
               <div className="flex justify-between text-xs">
                 <span className="text-muted-foreground">GCLID</span>
                 <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-foreground/70">
                   {lead.gclid || 'None'}
                 </span>
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
                   {events.length === 0 ? (
                     <p className="text-sm text-muted-foreground italic ml-10">No activities recorded yet.</p>
                   ) : (
                     events.map((event) => (
                       <div key={event.id} className="relative flex items-start gap-6">
                         <div className="absolute left-0 flex items-center justify-center w-10 h-10 rounded-full bg-background border shadow-sm ring-8 ring-background">
                           <Activity className="h-4 w-4 text-primary" />
                         </div>
                         <div className="flex-1 ml-10">
                           <div className="flex items-center justify-between">
                             <h4 className="text-sm font-semibold capitalize">{event.event_type.replace('_', ' ')}</h4>
                             <span className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString()}</span>
                           </div>
                           <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                         </div>
                       </div>
                     ))
                   )}
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