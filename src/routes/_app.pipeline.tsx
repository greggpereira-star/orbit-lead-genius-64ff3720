  import { createFileRoute } from '@tanstack/react-router';
  import { KanbanBoard } from '@/modules/crm/components/KanbanBoard';
  import { Button } from '@/components/ui/button';
  import { ErrorBoundary } from '@/components/error/ErrorBoundary';
 import { Plus, LayoutGrid, List } from 'lucide-react';
 import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
 
 export const Route = createFileRoute('/_app/pipeline')({
   component: PipelinePage,
 });
 
 function PipelinePage() {
   return (
     <div className="space-y-6">
       <div className="flex justify-between items-end">
         <div>
           <h1 className="text-2xl font-bold tracking-tight text-foreground">Sales Pipeline</h1>
           <p className="text-muted-foreground text-sm">Visualize and manage your deals through stages.</p>
         </div>
         <div className="flex items-center gap-3">
           <Tabs defaultValue="kanban" className="w-[200px]">
             <TabsList className="grid w-full grid-cols-2">
               <TabsTrigger value="kanban" className="flex items-center gap-2">
                 <LayoutGrid className="h-3.5 w-3.5" />
                 Kanban
               </TabsTrigger>
               <TabsTrigger value="list" className="flex items-center gap-2">
                 <List className="h-3.5 w-3.5" />
                 List
               </TabsTrigger>
             </TabsList>
           </Tabs>
           <Button className="flex items-center gap-2">
             <Plus className="h-4 w-4" />
             New Deal
           </Button>
         </div>
       </div>
 
       <KanbanBoard />
     </div>
   );
 }