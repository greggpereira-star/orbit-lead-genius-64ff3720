 import { createFileRoute } from '@tanstack/react-router';
 import { WorkflowEditor } from '@/modules/automation/components/WorkflowEditor';
 
 export const Route = createFileRoute('/_app/automations')({
   component: AutomationsPage,
 });
 
 function AutomationsPage() {
   return (
     <div className="space-y-6">
       <div>
         <h1 className="text-2xl font-bold tracking-tight text-foreground">Marketing Automation</h1>
         <p className="text-muted-foreground text-sm">Design and deploy event-driven workflows.</p>
       </div>
       <WorkflowEditor />
     </div>
   );
 }