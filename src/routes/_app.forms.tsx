 import { createFileRoute } from '@tanstack/react-router';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { CaptureForm } from '@/modules/capture/components/CaptureForm';
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
 
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
         <div className="lg:col-span-2">
           <Card className="border-none shadow-sm">
             <CardHeader>
               <CardTitle>Active Forms</CardTitle>
               <CardDescription>Forms currently collecting leads.</CardDescription>
             </CardHeader>
             <CardContent>
               <div className="space-y-4">
                 {[1, 2].map((i) => (
                   <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                     <div className="flex items-center gap-3">
                       <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                         <FileText className="h-5 w-5 text-primary" />
                       </div>
                       <div>
                         <h4 className="font-medium text-sm">Enterprise Inquiry Form</h4>
                         <p className="text-xs text-muted-foreground">Created 2 weeks ago • 148 submissions</p>
                       </div>
                     </div>
                     <div className="flex items-center gap-2">
                       <Button variant="outline" size="sm" className="h-8 gap-2">
                         <Copy className="h-3.5 w-3.5" />
                         Embed
                       </Button>
                       <Button variant="ghost" size="icon" className="h-8 w-8">
                         <ExternalLink className="h-4 w-4" />
                       </Button>
                     </div>
                   </div>
                 ))}
               </div>
             </CardContent>
           </Card>
         </div>
         <div className="lg:col-span-1">
           <Card className="border-none shadow-sm">
             <CardHeader>
               <CardTitle>Preview</CardTitle>
               <CardDescription>How your form looks to customers.</CardDescription>
             </CardHeader>
             <CardContent>
               <div className="p-4 border rounded-lg bg-slate-50">
                 <CaptureForm />
               </div>
             </CardContent>
           </Card>
         </div>
       </div>
     </div>
   );
 }