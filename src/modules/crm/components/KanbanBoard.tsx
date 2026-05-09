 import React, { useState, useEffect } from 'react';
 import { supabase } from '@/lib/supabase';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 import { toast } from 'sonner';
 import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
 import { Card } from '@/components/ui/card';
 import { Badge } from '@/components/ui/badge';
 import { MoreHorizontal, GripVertical } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { useNavigate } from '@tanstack/react-router';
 
 interface Lead {
   id: string;
   name: string;
   company?: string;
   value?: string;
   temperature: 'cold' | 'warm' | 'hot';
   score: number;
 }
 
 interface Column {
   id: string;
   title: string;
   leads: Lead[];
 }
 
 const initialData: Column[] = [
   {
     id: 'new',
     title: 'New Leads',
     leads: [
       { id: '1', name: 'John Doe', company: 'Acme Corp', value: '$1,200', temperature: 'hot', score: 85 },
       { id: '2', name: 'Sarah Miller', company: 'Global Tech', value: '$3,500', temperature: 'warm', score: 65 },
     ],
   },
   {
     id: 'contacted',
     title: 'Contacted',
     leads: [
       { id: '3', name: 'Robert Wilson', company: 'Wilson & Co', value: '$800', temperature: 'cold', score: 30 },
     ],
   },
   {
     id: 'qualified',
     title: 'Qualified',
     leads: [
       { id: '4', name: 'Emma Davis', company: 'Design Pro', value: '$5,000', temperature: 'hot', score: 92 },
     ],
   },
   {
     id: 'negotiation',
     title: 'Negotiation',
     leads: [],
   },
 ];
 
 export function KanbanBoard() {
   const { company } = useAuth();
   const [columns, setColumns] = useState<Column[]>([]);
   const [isLoading, setIsLoading] = useState(true);
 
   useEffect(() => {
     if (company) {
       fetchData();
     }
   }, [company]);
 
   const fetchData = async () => {
     setIsLoading(true);
     try {
       // 1. Fetch stages
       const { data: stagesData, error: stagesError } = await supabase
         .from('stages')
         .select('*')
         .eq('company_id', company?.id)
         .order('order_index');
 
       if (stagesError) throw stagesError;
 
       // 2. Fetch leads
       const { data: leadsData, error: leadsError } = await supabase
         .from('leads')
         .select('*')
         .eq('company_id', company?.id);
 
       if (leadsError) throw leadsError;
 
       // 3. Map leads to stages
       const mappedColumns = (stagesData || []).map((stage: any) => ({
         id: stage.id,
         title: stage.name,
           leads: (leadsData || []).filter((lead: any) => lead.stage_id === stage.id).map((lead: any) => ({
           id: lead.id,
           name: lead.name || 'Unnamed Lead',
           company: lead.metadata?.company_name,
           value: lead.income ? `$${lead.income}` : undefined,
           temperature: lead.temperature as 'cold' | 'warm' | 'hot',
           score: lead.score || 0
         }))
       }));
 
       setColumns(mappedColumns);
     } catch (error) {
       console.error('Error fetching Kanban data:', error);
       toast.error('Failed to load pipeline');
     } finally {
       setIsLoading(false);
     }
   };
 
   const onDragEnd = async (result: DropResult) => {
     const { destination, source, draggableId } = result;
 
     if (!destination) return;
     if (
       destination.droppableId === source.droppableId &&
       destination.index === source.index
     ) {
       return;
     }
 
     const sourceCol = columns.find(col => col.id === source.droppableId);
     const destCol = columns.find(col => col.id === destination.droppableId);
 
     if (!sourceCol || !destCol) return;
 
     if (sourceCol === destCol) {
       const newLeads = Array.from(sourceCol.leads);
       const [removed] = newLeads.splice(source.index, 1);
       newLeads.splice(destination.index, 0, removed);
 
       const newColumns = columns.map(col => 
         col.id === sourceCol.id ? { ...col, leads: newLeads } : col
       );
       setColumns(newColumns);
     } else {
       const sourceLeads = Array.from(sourceCol.leads);
       const [removed] = sourceLeads.splice(source.index, 1);
       const destLeads = Array.from(destCol.leads);
       destLeads.splice(destination.index, 0, removed);
 
       const newColumns = columns.map(col => {
         if (col.id === sourceCol.id) return { ...col, leads: sourceLeads };
         if (col.id === destCol.id) return { ...col, leads: destLeads };
         return col;
       });
       setColumns(newColumns);
 
       // Update in database
       const { error } = await supabase
         .from('leads')
         .update({ stage_id: destination.droppableId })
         .eq('id', draggableId);
 
       if (error) {
         toast.error('Failed to move lead');
         fetchData(); // Revert
       } else {
         // Log event
         await supabase.from('lead_events').insert({
           lead_id: draggableId,
           event_type: 'stage_change',
           description: `Moved from ${sourceCol.title} to ${destCol.title}`
         });
       }
     }
   };
 
   return (
     <DragDropContext onDragEnd={onDragEnd}>
       <div className="flex gap-4 overflow-x-auto pb-4 h-[calc(100vh-200px)] min-h-[500px]">
         {columns.map((column) => (
           <div key={column.id} className="flex flex-col w-80 shrink-0">
             <div className="flex items-center justify-between mb-3 px-1">
               <div className="flex items-center gap-2">
                 <h3 className="font-semibold text-sm">{column.title}</h3>
                 <Badge variant="secondary" className="bg-muted text-muted-foreground font-normal">
                   {column.leads.length}
                 </Badge>
               </div>
               <Button variant="ghost" size="icon" className="h-8 w-8">
                 <MoreHorizontal className="h-4 w-4" />
               </Button>
             </div>
 
             <Droppable droppableId={column.id}>
               {(provided, snapshot) => (
                 <div
                   {...provided.droppableProps}
                   ref={provided.innerRef}
                   className={`flex-1 rounded-lg transition-colors p-2 space-y-3 ${
                     snapshot.isDraggingOver ? 'bg-muted/50' : 'bg-muted/20'
                   }`}
                 >
                   {column.leads.map((lead, index) => (
                     <Draggable key={lead.id} draggableId={lead.id} index={index}>
                       {(provided, snapshot) => (
                         <Card
                           ref={provided.innerRef}
                           {...provided.draggableProps}
                           onClick={() => window.location.href = `/leads/${lead.id}`}
                           className={`p-3 shadow-sm border-none group cursor-pointer hover:ring-1 hover:ring-primary/20 transition-all ${
                             snapshot.isDragging ? 'shadow-lg rotate-2' : ''
                           }`}
                         >
                           <div className="flex items-start justify-between mb-2">
                             <div className="flex-1">
                               <div className="flex items-center gap-2">
                                 <div {...provided.dragHandleProps} className="opacity-0 group-hover:opacity-100 transition-opacity">
                                   <GripVertical className="h-3 w-3 text-muted-foreground" />
                                 </div>
                                 <span className="font-medium text-sm">{lead.name}</span>
                               </div>
                               {lead.company && (
                                 <p className="text-xs text-muted-foreground ml-5">{lead.company}</p>
                               )}
                             </div>
                             <Badge 
                               variant="outline" 
                               className={`text-[10px] h-5 ${
                                 lead.temperature === 'hot' ? 'text-rose-600 bg-rose-50 border-rose-100' : 
                                 lead.temperature === 'warm' ? 'text-amber-600 bg-amber-50 border-amber-100' : 
                                 'text-blue-600 bg-blue-50 border-blue-100'
                               }`}
                             >
                               {lead.temperature}
                             </Badge>
                           </div>
                           
                           <div className="flex items-center justify-between mt-4">
                             <span className="text-xs font-semibold text-foreground">{lead.value || '—'}</span>
                             <div className="flex items-center gap-1.5">
                               <div className="w-12 h-1 bg-muted rounded-full overflow-hidden">
                                 <div 
                                   className="h-full bg-primary" 
                                   style={{ width: `${lead.score}%` }}
                                 />
                               </div>
                               <span className="text-[10px] text-muted-foreground font-medium">{lead.score}</span>
                             </div>
                           </div>
                         </Card>
                       )}
                     </Draggable>
                   ))}
                   {provided.placeholder}
                 </div>
               )}
             </Droppable>
           </div>
         ))}
       </div>
     </DragDropContext>
   );
 }