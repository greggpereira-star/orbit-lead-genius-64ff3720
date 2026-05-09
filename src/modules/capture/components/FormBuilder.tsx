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
 
 interface FormField {
   id: string;
   label: string;
   type: 'text' | 'email' | 'phone' | 'select' | 'textarea';
   required: boolean;
   placeholder: string;
 }
 
 export function FormBuilder() {
   const [fields, setFields] = useState<FormField[]>([
     { id: '1', label: 'Full Name', type: 'text', required: true, placeholder: 'Ex: John Doe' },
     { id: '2', label: 'Work Email', type: 'email', required: true, placeholder: 'Ex: john@company.com' },
     { id: '3', label: 'Phone Number', type: 'phone', required: false, placeholder: 'Ex: +1...' },
   ]);
 
   const addField = () => {
     const newField: FormField = {
       id: Math.random().toString(36).substr(2, 9),
       label: 'New Field',
       type: 'text',
       required: false,
       placeholder: 'Enter text...'
     };
     setFields([...fields, newField]);
   };
 
   const removeField = (id: string) => {
     setFields(fields.filter(f => f.id !== id));
   };
 
   return (
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
                 key={field.id} 
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
                       onClick={() => removeField(field.id)}
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
                 <Input placeholder="E.g. Enterprise Contact" defaultValue="Enterprise Inquiry" />
               </div>
               <div className="space-y-2">
                 <Label className="text-xs">Submit Button Text</Label>
                 <Input placeholder="E.g. Send" defaultValue="Request Contact" />
               </div>
               <div className="flex items-center justify-between">
                 <div className="space-y-0.5">
                   <Label className="text-xs">Track UTMs</Label>
                   <p className="text-[10px] text-muted-foreground">Automatically capture marketing data</p>
                 </div>
                 <Switch checked />
               </div>
               <div className="flex items-center justify-between">
                 <div className="space-y-0.5">
                   <Label className="text-xs">Enable Meta CAPI</Label>
                   <p className="text-[10px] text-muted-foreground">Send server-side events</p>
                 </div>
                 <Switch checked />
               </div>
             </div>
 
             <div className="pt-4 border-t space-y-2">
               <Button className="w-full gap-2">
                 <CheckCircle2 className="h-4 w-4" />
                 Save Form
               </Button>
               <div className="grid grid-cols-2 gap-2">
                 <Button variant="outline" className="gap-2 text-xs">
                   <Eye className="h-3.5 w-3.5" />
                   Preview
                 </Button>
                 <Button variant="outline" className="gap-2 text-xs">
                   <Code2 className="h-3.5 w-3.5" />
                   Embed
                 </Button>
               </div>
             </div>
           </CardContent>
         </Card>
       </div>
     </div>
   );
 }