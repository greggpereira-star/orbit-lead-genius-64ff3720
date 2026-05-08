 import { createFileRoute } from '@tanstack/react-router';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { FormBuilder } from '@/modules/capture/components/FormBuilder';
 import { Button } from '@/components/ui/button';
 import { Plus, FileText, Copy, ExternalLink } from 'lucide-react';
 
 export const Route = createFileRoute('/_app/forms')({
   component: FormsPage,
 });
 
 function FormsPage() {
   return (
     <div className="space-y-6">
       <div className="flex justify-between items-end">
         <div>
           <h1 className="text-2xl font-bold tracking-tight text-foreground">Forms & Capture</h1>
           <p className="text-muted-foreground text-sm">Create and manage your lead capture forms.</p>
         </div>
         <Button className="flex items-center gap-2">
           <Plus className="h-4 w-4" />
           Create Form
         </Button>
       </div>
 
        <FormBuilder />
     </div>
   );
 }