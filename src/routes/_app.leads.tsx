 import { createFileRoute } from '@tanstack/react-router';
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
 import { Search, Filter, Plus, MoreHorizontal } from 'lucide-react';
 
 export const Route = createFileRoute('/_app/leads')({
   component: LeadsPage,
 });
 
 const mockLeads = [
   { id: '1', name: 'John Doe', email: 'john@example.com', status: 'new', temperature: 'hot', score: 85, created_at: '2024-03-20' },
   { id: '2', name: 'Jane Smith', email: 'jane@example.com', status: 'qualified', temperature: 'warm', score: 65, created_at: '2024-03-19' },
   { id: '3', name: 'Bob Johnson', email: 'bob@example.com', status: 'contacted', temperature: 'cold', score: 30, created_at: '2024-03-18' },
 ];
 
 function LeadsPage() {
   return (
     <div className="space-y-6">
       <div className="flex justify-between items-end">
         <div>
           <h1 className="text-2xl font-bold tracking-tight text-foreground">Leads</h1>
           <p className="text-muted-foreground text-sm">Manage and track your potential customers.</p>
         </div>
         <Button className="flex items-center gap-2">
           <Plus className="h-4 w-4" />
           Add Lead
         </Button>
       </div>
 
       <div className="flex items-center gap-4">
         <div className="relative flex-1 max-w-sm">
           <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
           <Input placeholder="Search leads..." className="pl-10 h-9" />
         </div>
         <Button variant="outline" size="sm" className="h-9 gap-2">
           <Filter className="h-4 w-4" />
           Filter
         </Button>
       </div>
 
       <div className="border rounded-lg bg-card">
         <Table>
           <TableHeader>
             <TableRow>
               <TableHead>Name</TableHead>
               <TableHead>Status</TableHead>
               <TableHead>Temperature</TableHead>
               <TableHead>Score</TableHead>
               <TableHead>Created</TableHead>
               <TableHead className="text-right"></TableHead>
             </TableRow>
           </TableHeader>
           <TableBody>
             {mockLeads.map((lead) => (
               <TableRow key={lead.id}>
                 <TableCell className="font-medium">
                   <div>{lead.name}</div>
                   <div className="text-xs text-muted-foreground">{lead.email}</div>
                 </TableCell>
                 <TableCell>
                   <Badge variant="secondary" className="capitalize">{lead.status}</Badge>
                 </TableCell>
                 <TableCell>
                   <div className="flex items-center gap-2">
                     <div className={`h-2 w-2 rounded-full ${
                       lead.temperature === 'hot' ? 'bg-rose-500' : 
                       lead.temperature === 'warm' ? 'bg-amber-500' : 'bg-blue-500'
                     }`} />
                     <span className="capitalize">{lead.temperature}</span>
                   </div>
                 </TableCell>
                 <TableCell>
                   <div className="flex items-center gap-2 w-24">
                     <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                       <div 
                         className="h-full bg-primary" 
                         style={{ width: `${lead.score}%` }}
                       />
                     </div>
                     <span className="text-xs font-medium">{lead.score}</span>
                   </div>
                 </TableCell>
                 <TableCell className="text-muted-foreground">{lead.created_at}</TableCell>
                 <TableCell className="text-right">
                   <Button variant="ghost" size="icon">
                     <MoreHorizontal className="h-4 w-4" />
                   </Button>
                 </TableCell>
               </TableRow>
             ))}
           </TableBody>
         </Table>
       </div>
     </div>
   );
 }