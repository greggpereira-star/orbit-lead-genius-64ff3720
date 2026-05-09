import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  GripVertical, 
  Plus, 
  Trash2, 
  Settings2, 
  Eye, 
  Code2,
  CheckCircle2,
  ArrowLeft,
  Save,
  Loader2
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formService, Form, FormField } from '../services/formService';
import { toast } from 'sonner';
import { logger } from '@/core/observability/logger';

 interface FormBuilderProps {
   formId?: string;
   onBack: () => void;
 }
 
 export function FormBuilder({ formId, onBack }: FormBuilderProps) {
   const { company } = useAuth();
   const queryClient = useQueryClient();
   const [fields, setFields] = useState<Partial<FormField>[]>([]);
   const [formConfig, setFormConfig] = useState<Partial<Form>>({
     name: 'Untitled Form',
     slug: '',
     status: 'draft',
     type: 'traditional',
     settings: {
       submit_label: 'Submit',
       success_message: 'Thank you!',
       theme: 'premium-light',
       cv_crm_integration: false,
       capture_utms: true
     }
   });
 
   const { data: existingForm, isLoading } = useQuery({
     queryKey: ['form', formId],
     queryFn: () => formService.getFormById(formId!),
     enabled: !!formId,
   });
 
   useEffect(() => {
     if (existingForm) {
       setFormConfig(existingForm);
       setFields(existingForm.form_fields.sort((a, b) => a.sort_order - b.sort_order));
     } else if (!formId) {
       setFields([
         { label: 'Full Name', type: 'text', required: true, placeholder: 'Ex: John Doe' },
         { label: 'Email', type: 'email', required: true, placeholder: 'Ex: john@example.com' },
       ]);
     }
   }, [existingForm, formId]);
 
   const saveMutation = useMutation({
     mutationFn: async () => {
       if (!company?.id) return;
       if (formId) {
         return formService.updateForm(formId, formConfig, fields as FormField[]);
       } else {
         return formService.createForm(company.id, formConfig, fields as FormField[]);
       }
     },
     onSuccess: () => {
       queryClient.invalidateQueries({ queryKey: ['forms'] });
       toast.success(formId ? 'Form updated' : 'Form created');
       onBack();
     },
     onError: (error: any) => {
       logger.error('Failed to save form', { error });
       toast.error('Failed to save form');
     }
   });
 
   const addField = () => {
     const newField: Partial<FormField> = {
       label: 'New Field',
       type: 'text',
       required: false,
       placeholder: 'Enter text...'
     };
     setFields([...fields, newField]);
   };
 
   const removeField = (index: number) => {
     const newFields = [...fields];
     newFields.splice(index, 1);
     setFields(newFields);
   };
 
   if (isLoading) {
     return (
       <div className="flex h-64 items-center justify-center">
         <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
     );
   }
 
   return (
     <div className="space-y-6">
       <div className="flex items-center justify-between">
         <div className="flex items-center gap-4">
           <Button variant="ghost" size="icon" onClick={onBack}>
             <ArrowLeft className="h-5 w-5" />
           </Button>
           <div>
             <CardTitle className="text-xl font-bold">{formId ? 'Edit Form' : 'New Form'}</CardTitle>
             <CardDescription>Configure fields and settings</CardDescription>
           </div>
         </div>
         <div className="flex items-center gap-2">
           <Button variant="outline" onClick={onBack}>Cancel</Button>
           <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
             {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
             Save Form
           </Button>
         </div>
       </div>
 
       <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
         <div className="lg:col-span-8 space-y-4">
           <Card className="border-none shadow-sm">
             <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
               <div>
                 <CardTitle className="text-lg font-semibold">Form Structure</CardTitle>
                 <CardDescription>Drag and drop fields to reorder</CardDescription>
               </div>
               <Button onClick={addField} size="sm" className="gap-2">
                 <Plus className="h-4 w-4" />
                 Add Field
               </Button>
             </CardHeader>
             <CardContent className="space-y-3">
               {fields.map((field, index) => (
                 <div 
                   key={index} 
                   className="group flex items-center gap-4 p-4 rounded-xl border bg-card hover:border-primary/50 transition-all shadow-sm"
                 >
                   <div className="cursor-grab text-muted-foreground group-hover:text-primary transition-colors">
                     <GripVertical className="h-5 w-5" />
                   </div>
                   
                   <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                     <div className="space-y-1.5">
                       <Label className="text-xs">Field Label</Label>
                       <Input 
                         value={field.label} 
                         onChange={(e) => {
                           const newFields = [...fields];
                           newFields[index].label = e.target.value;
                           setFields(newFields);
                         }}
                         className="h-9"
                       />
                     </div>
                     <div className="space-y-1.5">
                       <Label className="text-xs">Field Type</Label>
                       <select 
                         className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                         value={field.type}
                         onChange={(e) => {
                           const newFields = [...fields];
                           newFields[index].type = e.target.value as any;
                           setFields(newFields);
                         }}
                       >
                         <option value="text">Text Input</option>
                         <option value="email">Email</option>
                         <option value="phone">Phone</option>
                         <option value="textarea">Textarea</option>
                         <option value="select">Dropdown</option>
                       </select>
                     </div>
                     <div className="flex items-center gap-4 pt-6">
                       <div className="flex items-center gap-2">
                         <Switch 
                           checked={field.required} 
                           onCheckedChange={(val) => {
                             const newFields = [...fields];
                             newFields[index].required = val;
                             setFields(newFields);
                           }}
                         />
                         <span className="text-xs font-medium">Required</span>
                       </div>
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         className="h-8 w-8 text-muted-foreground hover:text-destructive"
                         onClick={() => removeField(index)}
                       >
                         <Trash2 className="h-4 w-4" />
                       </Button>
                     </div>
                   </div>
                 </div>
               ))}
             </CardContent>
           </Card>
         </div>
 
         <div className="lg:col-span-4 space-y-6">
           <Card className="border-none shadow-sm sticky top-6">
             <CardHeader>
               <div className="flex items-center justify-between">
                 <CardTitle className="text-base">Form Settings</CardTitle>
                 <Settings2 className="h-4 w-4 text-muted-foreground" />
               </div>
             </CardHeader>
             <CardContent className="space-y-6">
               <div className="space-y-4">
                 <div className="space-y-2">
                   <Label className="text-xs">Form Name</Label>
                   <Input 
                     value={formConfig.name} 
                     onChange={(e) => setFormConfig({...formConfig, name: e.target.value})}
                     placeholder="E.g. Enterprise Contact" 
                   />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-xs">Slug</Label>
                   <Input 
                     value={formConfig.slug} 
                     onChange={(e) => setFormConfig({...formConfig, slug: e.target.value})}
                     placeholder="e-g-enterprise-contact" 
                   />
                 </div>
                 <div className="space-y-2">
                   <Label className="text-xs">Submit Button Text</Label>
                   <Input 
                     value={formConfig.settings?.submit_label} 
                     onChange={(e) => setFormConfig({
                       ...formConfig, 
                       settings: { ...formConfig.settings!, submit_label: e.target.value }
                     })}
                     placeholder="E.g. Send" 
                   />
                 </div>
                 <div className="flex items-center justify-between">
                   <div className="space-y-0.5">
                     <Label className="text-xs">Track UTMs</Label>
                     <p className="text-[10px] text-muted-foreground">Automatically capture marketing data</p>
                   </div>
                   <Switch 
                     checked={formConfig.settings?.capture_utms} 
                     onCheckedChange={(val) => setFormConfig({
                       ...formConfig, 
                       settings: { ...formConfig.settings!, capture_utms: val }
                     })}
                   />
                 </div>
                 <div className="flex items-center justify-between">
                   <div className="space-y-0.5">
                     <Label className="text-xs">Published</Label>
                     <p className="text-[10px] text-muted-foreground">Make form public</p>
                   </div>
                   <Switch 
                     checked={formConfig.status === 'published'} 
                     onCheckedChange={(val) => setFormConfig({
                       ...formConfig, 
                       status: val ? 'published' : 'draft'
                     })}
                   />
                 </div>
               </div>
             </CardContent>
           </Card>
         </div>
       </div>
     </div>
   );
 }