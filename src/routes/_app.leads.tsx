 import { createFileRoute, Link } from '@tanstack/react-router';
 import { useState, useEffect } from 'react';
 import { supabase } from '@/lib/supabase';
 import { useAuth } from '@/core/auth/hooks/useAuth';
import { 
  Table, 
  TableBody, 
  TableCell, 
   TableHead,
   TableHeader,
   TableRow
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
  import { Search, Filter, Plus, MoreHorizontal, Globe, Share2, UserPlus, X } from 'lucide-react';
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

  export const Route = createFileRoute('/_app/leads')({
    component: LeadsPage,
  });
  
  function LeadsPage() {
   const { company } = useAuth();
   const [leads, setLeads] = useState<any[]>([]);
   const [isLoading, setIsLoading] = useState(true);
 
   useEffect(() => {
     if (company) {
       fetchLeads();
     }
   }, [company]);
 
   const fetchLeads = async () => {
     setIsLoading(true);
     const { data, error } = await supabase
       .from('leads')
       .select('*')
       .eq('company_id', company?.id)
       .order('created_at', { ascending: false });
 
     if (data) setLeads(data);
     setIsLoading(false);
   };
  const getSourceIcon = (source: string) => {
    switch (source.toLowerCase()) {
       case 'google ads': return <Globe className="h-3.5 w-3.5 text-blue-500" />;
       case 'meta ads': return <Share2 className="h-3.5 w-3.5 text-blue-600" />;
      default: return <Globe className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Leads</h1>
          <p className="text-muted-foreground text-sm">Manage and track your potential customers with attribution intelligence.</p>
        </div>
         <Dialog>
           <DialogTrigger asChild>
             <Button className="flex items-center gap-2 font-bold h-10 shadow-lg shadow-primary/20">
               <Plus className="h-4 w-4" />
               Add Lead
             </Button>
           </DialogTrigger>
           <DialogContent className="sm:max-w-[500px]">
             <DialogHeader>
               <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                 <UserPlus className="h-5 w-5 text-primary" />
                 Create New Lead
               </DialogTitle>
               <DialogDescription>
                 Add a lead manually to your CDP. All automated intelligence will trigger after creation.
               </DialogDescription>
             </DialogHeader>
             <div className="space-y-4 py-4">
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <Label className="text-xs font-bold uppercase text-muted-foreground">Full Name</Label>
                   <Input placeholder="John Doe" />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-xs font-bold uppercase text-muted-foreground">Work Email</Label>
                   <Input type="email" placeholder="john@company.com" />
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-2">
                   <Label className="text-xs font-bold uppercase text-muted-foreground">Phone Number</Label>
                   <Input placeholder="+1..." />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-xs font-bold uppercase text-muted-foreground">Company</Label>
                   <Input placeholder="Acme Inc" />
                 </div>
               </div>
               <div className="space-y-2">
                 <Label className="text-xs font-bold uppercase text-muted-foreground">Lead Source (Manual Override)</Label>
                 <select className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none">
                   <option value="direct">Direct / Manual</option>
                   <option value="referral">Referral</option>
                   <option value="inbound">Inbound Content</option>
                   <option value="cold_outreach">Cold Outreach</option>
                 </select>
               </div>
             </div>
             <DialogFooter>
               <Button variant="outline" className="font-bold">Cancel</Button>
               <Button className="font-bold gap-2" onClick={() => {
                 toast.success('Lead created and intelligence processing started.');
               }}>
                 Create & Analyze Lead
               </Button>
             </DialogFooter>
           </DialogContent>
         </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search leads by name, email or company..." className="pl-10 h-9" />
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-2">
          <Filter className="h-4 w-4" />
          Advanced Filters
        </Button>
      </div>

      <div className="border rounded-lg bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="w-[250px]">Name & Contact</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Temperature</TableHead>
              <TableHead>Lead Score</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
           <TableBody>
             {isLoading ? (
               <TableRow>
                 <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Loading leads...</TableCell>
               </TableRow>
             ) : leads.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No leads found.</TableCell>
               </TableRow>
             ) : (
               leads.map((lead) => (
                 <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50 transition-colors group">
                   <TableCell className="font-medium p-0">
                     <Link to="/leads/$id" params={{ id: lead.id }} className="block p-4">
                       <div className="text-sm">{lead.name || 'Unnamed Lead'}</div>
                       <div className="text-[11px] text-muted-foreground font-normal">{lead.email}</div>
                     </Link>
                   </TableCell>
                 <TableCell>
                   <div className="flex items-center gap-2">
                     {getSourceIcon(lead.source || lead.utm_source || 'Direct')}
                     <span className="text-xs">{lead.source || lead.utm_source || 'Direct'}</span>
                   </div>
                 </TableCell>
                 <TableCell>
                   <Badge variant="secondary" className="capitalize text-[10px] py-0">{lead.status}</Badge>
                 </TableCell>
                 <TableCell>
                   <div className="flex items-center gap-2">
                     <div className={`h-1.5 w-1.5 rounded-full ${
                       lead.temperature === 'hot' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 
                       lead.temperature === 'warm' ? 'bg-amber-500' : 'bg-blue-500'
                     }`} />
                     <span className="capitalize text-xs">{lead.temperature}</span>
                   </div>
                 </TableCell>
                 <TableCell>
                   <div className="flex items-center gap-2 w-24">
                     <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                       <div 
                         className={`h-full ${
                           (lead.score || 0) > 80 ? 'bg-emerald-500' : 
                           (lead.score || 0) > 50 ? 'bg-primary' : 'bg-amber-500'
                         }`}
                         style={{ width: `${lead.score || 0}%` }}
                       />
                     </div>
                     <span className="text-[11px] font-bold">{lead.score || 0}</span>
                   </div>
                 </TableCell>
                 <TableCell className="text-[11px] text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</TableCell>
                 <TableCell className="text-right">
                   <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                     <MoreHorizontal className="h-4 w-4" />
                   </Button>
                 </TableCell>
               </TableRow>
             ))
             )}
           </TableBody>
        </Table>
      </div>
    </div>
  );
}
