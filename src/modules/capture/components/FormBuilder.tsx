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
   Loader2,
    Globe,
    ListPlus,
    X,
    Activity,
    BarChart3,
    FileText,
    Workflow
 } from 'lucide-react';
  import { FormEventsPanel } from './events/FormEventsPanel';
  import { FormSubmissionsPanel } from './events/FormSubmissionsPanel';
 import {
   DndContext,
   closestCenter,
   KeyboardSensor,
   PointerSensor,
   useSensor,
   useSensors,
   DragEndEvent
 } from '@dnd-kit/core';
 import {
   arrayMove,
   SortableContext,
   sortableKeyboardCoordinates,
   verticalListSortingStrategy,
   useSortable
 } from '@dnd-kit/sortable';
 import { CSS } from '@dnd-kit/utilities';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formService, Form, FormField } from '../services/formService';
import { toast } from 'sonner';
import { logger } from '@/core/observability/logger';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormPublish } from './FormPublish';

 interface FormBuilderProps {
   formId?: string;
   onBack: () => void;
 }
 
 function SortableField({ field, index, onUpdate, onRemove }: { 
   field: any, 
   index: number, 
   onUpdate: (index: number, data: any) => void,
   onRemove: (id: string) => void
 }) {
   const {
     attributes,
     listeners,
     setNodeRef,
     transform,
     transition,
     isDragging
   } = useSortable({ id: field.id });
 
   const style = {
     transform: CSS.Transform.toString(transform),
     transition,
     zIndex: isDragging ? 50 : undefined,
     opacity: isDragging ? 0.5 : 1,
   };
 
   return (
     <div 
       ref={setNodeRef}
       style={style}
       className="group flex flex-col gap-4 p-4 rounded-xl border bg-card hover:border-primary/50 transition-all shadow-sm"
     >
       <div className="flex items-center gap-4 w-full">
         <div 
           {...attributes} 
           {...listeners}
           className="cursor-grab text-muted-foreground group-hover:text-primary transition-colors p-1"
         >
           <GripVertical className="h-5 w-5" />
         </div>
         
         <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
           <div className="space-y-1.5">
             <Label className="text-xs">Field Label</Label>
             <Input 
               value={field.label} 
               onChange={(e) => onUpdate(index, { label: e.target.value })}
               className="h-9"
             />
           </div>
           <div className="space-y-1.5">
             <Label className="text-xs">Field Type</Label>
             <select 
               className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
               value={field.type}
               onChange={(e) => onUpdate(index, { type: e.target.value })}
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
                 onCheckedChange={(val) => onUpdate(index, { required: val })}
               />
               <span className="text-xs font-medium">Required</span>
             </div>
             <Button 
               variant="ghost" 
               size="icon" 
               className="h-8 w-8 text-muted-foreground hover:text-destructive"
               onClick={() => onRemove(field.id)}
             >
               <Trash2 className="h-4 w-4" />
             </Button>
           </div>
         </div>
       </div>
 
       {field.type === 'select' && (
         <div className="mt-2 pl-10 space-y-3 bg-muted/30 p-4 rounded-lg border border-dashed animate-in slide-in-from-top-2">
           <div className="flex items-center justify-between">
             <Label className="text-[10px] uppercase font-bold tracking-widest text-primary">Opções do Dropdown</Label>
             <Button 
               variant="ghost" 
               size="sm" 
               className="h-7 text-[10px] gap-1 px-2"
               onClick={() => {
                 const currentOptions = field.options || [];
                 onUpdate(index, { options: [...currentOptions, `Opção ${currentOptions.length + 1}`] });
               }}
             >
               <Plus className="h-3 w-3" /> Adicionar Opção
             </Button>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
             {(field.options || ['Opção 1', 'Opção 2']).map((option: string, optIndex: number) => (
               <div key={optIndex} className="flex gap-2 items-center">
                 <Input 
                   value={option}
                   onChange={(e) => {
                     const newOptions = [...(field.options || ['Opção 1', 'Opção 2'])];
                     newOptions[optIndex] = e.target.value;
                     onUpdate(index, { options: newOptions });
                   }}
                   placeholder={`Opção ${optIndex + 1}`}
                   className="h-8 text-xs"
                 />
                 <Button 
                   variant="ghost" 
                   size="icon" 
                   className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                   onClick={() => {
                     const newOptions = [...(field.options || ['Opção 1', 'Opção 2'])];
                     newOptions.splice(optIndex, 1);
                     onUpdate(index, { options: newOptions });
                   }}
                 >
                   <X className="h-3 w-3" />
                 </Button>
               </div>
             ))}
           </div>
           {(!field.options || field.options.length === 0) && (
             <p className="text-[10px] text-muted-foreground italic">Nenhuma opção cadastrada. Clique em adicionar para começar.</p>
           )}
         </div>
       )}
     </div>
   );
 }
 
 export function FormBuilder({ formId, onBack }: FormBuilderProps) {
  const { company } = useAuth();
  const queryClient = useQueryClient();
   const [fields, setFields] = useState<(Partial<FormField> & { id: string })[]>([]);
    const [showTemplates, setShowTemplates] = useState(!formId);
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
      setFields(existingForm.form_fields
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(f => ({ ...f, id: f.id }))
      );
      setShowTemplates(false);
    } else if (!formId) {
      setShowTemplates(true);
    }
  }, [existingForm, formId]);

    const saveMutation = useMutation({
      mutationFn: async () => {
        if (!company?.id) {
          throw new Error('Empresa não identificada. Por favor, recarregue a página.');
        }
  
        const cleanedFields = (fields as FormField[]).map(f => ({
          ...f,
          label: f.label || 'Campo sem nome',
          type: f.type || 'text',
          required: !!f.required,
          options: Array.isArray(f.options) ? f.options : [],
          placeholder: f.placeholder || ''
        }));
  
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Tempo limite de salvamento excedido (30s). Verifique sua conexão.')), 30000)
        );
  
        const savePromise = formId 
          ? formService.updateForm(formId, formConfig, cleanedFields)
          : formService.createForm(company.id, formConfig, cleanedFields);
  
        return Promise.race([savePromise, timeoutPromise]);
      },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
      toast.success(formId ? 'Form updated' : 'Form created');
      onBack();
    },
    onError: (error: any) => {
      logger.error('Failed to save form', { error });
      const message = error.message || 'Unknown error';
      logger.error('Failed to save form', { error });
      toast.error(`Failed to save form: ${message}`);
    }
  });

   const addField = () => {
     const id = Math.random().toString(36).substr(2, 9);
     const newField: Partial<FormField> & { id: string } = {
       id,
       label: 'Novo Campo',
       type: 'text',
       required: false,
       placeholder: 'Digite aqui...',
       options: []
     };
     setFields(prev => [...prev, newField]);
   };

   const removeField = (id: string) => {
     setFields(fields.filter(f => f.id !== id));
   };
 
   const sensors = useSensors(
     useSensor(PointerSensor),
     useSensor(KeyboardSensor, {
       coordinateGetter: sortableKeyboardCoordinates,
     })
   );
 
   const handleDragEnd = (event: DragEndEvent) => {
     const { active, over } = event;
     if (over && active.id !== over.id) {
       setFields((items) => {
         const oldIndex = items.findIndex((i) => i.id === active.id);
         const newIndex = items.findIndex((i) => i.id === over.id);
         return arrayMove(items, oldIndex, newIndex);
       });
     }
   };

   const applyTemplate = (template: any) => {
     setFormConfig(prev => ({
       ...prev,
       name: template.name,
       settings: { ...prev.settings, ...template.settings }
     }));
     setFields(template.fields.map((f: any) => ({
       ...f,
       id: Math.random().toString(36).substr(2, 9)
     })));
     setShowTemplates(false);
   };
 
   const templates = [
     {
       id: 'contact',
       name: 'Contato Imobiliário',
       description: 'Ideal para captura de leads em imóveis.',
       fields: [
         { label: 'Nome Completo', type: 'text', required: true, placeholder: 'Ex: João Silva' },
         { label: 'E-mail', type: 'email', required: true, placeholder: 'Ex: joao@email.com' },
         { label: 'Telefone/WhatsApp', type: 'phone', required: true, placeholder: 'Ex: (11) 99999-9999' },
         { label: 'Interesse', type: 'select', required: true, options: ['Comprar', 'Alugar', 'Vender'] },
       ],
       settings: { submit_label: 'Quero receber informações' }
     },
     {
       id: 'ecommerce',
       name: 'Orçamento E-commerce',
       description: 'Para produtos sob consulta ou personalizados.',
       fields: [
         { label: 'Nome', type: 'text', required: true },
         { label: 'WhatsApp', type: 'phone', required: true },
         { label: 'Produto de Interesse', type: 'text', required: true },
         { label: 'Quantidade', type: 'text', required: false },
         { label: 'Mensagem', type: 'textarea', required: false },
       ],
       settings: { submit_label: 'Solicitar Orçamento' }
     },
     {
       id: 'newsletter',
       name: 'Assinatura de Newsletter',
       description: 'Captura rápida apenas com e-mail.',
       fields: [
         { label: 'Seu melhor E-mail', type: 'email', required: true, placeholder: 'Ex: joao@email.com' },
       ],
       settings: { submit_label: 'Inscrever-se Agora' }
     }
   ];
 
  if (showTemplates && !formId && !isLoading) {
     return (
       <div className="space-y-8 animate-in fade-in duration-500">
         <div className="text-center space-y-2">
           <h2 className="text-3xl font-black uppercase tracking-tighter">Escolha um Modelo</h2>
           <p className="text-muted-foreground">Comece rápido com um de nossos templates otimizados para conversão.</p>
         </div>
         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           {templates.map((template) => (
             <Card key={template.id} className="group cursor-pointer hover:ring-2 hover:ring-primary transition-all overflow-hidden border-none shadow-sm" onClick={() => applyTemplate(template)}>
               <div className="h-2 bg-primary/20 group-hover:bg-primary transition-colors" />
               <CardHeader>
                 <CardTitle className="text-lg">{template.name}</CardTitle>
                 <CardDescription>{template.description}</CardDescription>
               </CardHeader>
               <CardContent>
                 <div className="space-y-2">
                   {template.fields.slice(0, 3).map((f, i) => (
                     <div key={i} className="h-8 bg-muted rounded animate-pulse" />
                   ))}
                   {template.fields.length > 3 && <p className="text-[10px] text-center text-muted-foreground">+{template.fields.length - 3} campos</p>}
                 </div>
               </CardContent>
               <div className="p-4 bg-muted/50 border-t flex justify-center">
                 <Button variant="ghost" size="sm" className="font-bold uppercase tracking-widest text-[10px]">Usar este modelo</Button>
               </div>
             </Card>
           ))}
           <Card className="border-dashed flex flex-col items-center justify-center p-6 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => setShowTemplates(false)}>
             <Plus className="h-8 w-8 text-muted-foreground mb-2" />
             <p className="font-bold text-sm">Começar do Zero</p>
             <p className="text-xs text-muted-foreground text-center">Crie seu próprio formulário do seu jeito.</p>
           </Card>
         </div>
         <div className="flex justify-center">
           <Button variant="ghost" onClick={onBack}>Voltar para lista</Button>
         </div>
       </div>
     );
   }
 
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

      <Tabs defaultValue="builder" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent h-12 p-0 gap-8">
          <TabsTrigger 
            value="builder" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-2 gap-2"
          >
            <Settings2 className="h-4 w-4" /> Builder
          </TabsTrigger>
          <TabsTrigger 
            value="publish" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-2 gap-2"
            disabled={!formId}
          >
            <Globe className="h-4 w-4" /> Publicação
          </TabsTrigger>
          <TabsTrigger 
            value="events" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-2 gap-2"
            disabled={!formId}
          >
            <Activity className="h-4 w-4" /> Eventos
          </TabsTrigger>
          <TabsTrigger 
            value="analytics" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-2 gap-2"
            disabled={!formId}
          >
            <BarChart3 className="h-4 w-4" /> Analytics
          </TabsTrigger>
          <TabsTrigger 
            value="submissions" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-2 gap-2"
            disabled={!formId}
          >
            <FileText className="h-4 w-4" /> Submissões
          </TabsTrigger>
        </TabsList>

        <TabsContent value="builder" className="pt-6">
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
                   <DndContext 
                     sensors={sensors}
                     collisionDetection={closestCenter}
                     onDragEnd={handleDragEnd}
                   >
                     <SortableContext 
                       items={fields.map(f => f.id)}
                       strategy={verticalListSortingStrategy}
                     >
                       {fields.map((field, index) => (
                         <SortableField 
                           key={field.id} 
                           field={field} 
                           index={index}
                           onRemove={removeField}
                           onUpdate={(idx: number, data: any) => {
                             const newFields = [...fields];
                             newFields[idx] = { ...newFields[idx], ...data };
                             setFields(newFields);
                           }}
                         />
                       ))}
                     </SortableContext>
                   </DndContext>
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
                        onChange={(e) => setFormConfig(prev => ({...prev, name: e.target.value}))}
                        placeholder="E.g. Enterprise Contact" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Slug</Label>
                      <Input 
                        value={formConfig.slug} 
                        onChange={(e) => setFormConfig(prev => ({...prev, slug: e.target.value}))}
                        placeholder="e-g-enterprise-contact" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Submit Button Text</Label>
                      <Input 
                        value={formConfig.settings?.submit_label} 
                        onChange={(e) => setFormConfig(prev => {
                          const currentSettings = prev.settings || {
                            submit_label: 'Submit',
                            success_message: 'Thank you!',
                            theme: 'premium-light',
                            cv_crm_integration: false,
                            capture_utms: true
                          };
                          return {
                            ...prev,
                            settings: { ...currentSettings, submit_label: e.target.value }
                          };
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
                        onCheckedChange={(val) => setFormConfig(prev => {
                          const currentSettings = prev.settings || {
                            submit_label: 'Submit',
                            success_message: 'Thank you!',
                            theme: 'premium-light',
                            cv_crm_integration: false,
                            capture_utms: true
                          };
                          return {
                            ...prev,
                            settings: { ...currentSettings, capture_utms: val }
                          };
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
                        onCheckedChange={(val) => setFormConfig(prev => ({
                          ...prev, 
                          status: val ? 'published' : 'draft'
                        }))}
                      />
                    </div>

                    <div className="space-y-4 pt-4 border-t">
                      <Label className="text-[10px] uppercase font-bold tracking-widest opacity-70">Post-Submission</Label>
                      <div className="space-y-2">
                        <Label className="text-xs">Success Message</Label>
                        <Input 
                          value={formConfig.settings?.success_message} 
                          onChange={(e) => setFormConfig(prev => {
                            const currentSettings = prev.settings || {
                              submit_label: 'Submit',
                              success_message: 'Thank you!',
                              theme: 'premium-light',
                              cv_crm_integration: false,
                              capture_utms: true
                            };
                            return {
                              ...prev,
                              settings: { ...currentSettings, success_message: e.target.value }
                            };
                          })}
                          placeholder="Thank you for your interest!" 
                        />
                      </div>
                    <div className="space-y-2">
                      <Label className="text-xs">Redirect URL (Optional)</Label>
                      <textarea
                        className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono break-all"
                        value={formConfig.settings?.redirect_url || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormConfig(prev => ({
                            ...prev,
                            settings: {
                              ...(prev.settings || {
                                submit_label: 'Submit',
                                success_message: 'Thank you!',
                                theme: 'premium-light',
                                cv_crm_integration: false,
                                capture_utms: true
                              }),
                              redirect_url: val
                            }
                          }));
                        }}
                        placeholder="https://example.com/thanks"
                      />
                      <p className="text-[10px] text-muted-foreground">Support for complex URLs (e.g., WhatsApp with parameters).</p>
                    </div>
                      <div className="space-y-2">
                        <Label className="text-xs">WhatsApp (Optional)</Label>
                        <Input 
                          value={formConfig.settings?.whatsapp_number || ''} 
                          onChange={(e) => setFormConfig(prev => {
                            const currentSettings = prev.settings || {
                              submit_label: 'Submit',
                              success_message: 'Thank you!',
                              theme: 'premium-light',
                              cv_crm_integration: false,
                              capture_utms: true
                            };
                            return {
                              ...prev,
                              settings: { ...currentSettings, whatsapp_number: e.target.value }
                            };
                          })}
                          placeholder="5511999999999" 
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

         <TabsContent value="publish" className="pt-6">
           {existingForm && <FormPublish form={existingForm} />}
         </TabsContent>

         <TabsContent value="events" className="pt-6">
           {formId && <FormEventsPanel formId={formId} />}
         </TabsContent>

         <TabsContent value="analytics" className="pt-6">
           <div className="flex flex-col items-center justify-center h-64 text-center">
             <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
             <h3 className="text-lg font-bold">Analytics em Tempo Real</h3>
             <p className="text-muted-foreground max-w-sm">Os dados de conversão e visualização aparecerão aqui conforme os leads forem capturados.</p>
           </div>
         </TabsContent>

         <TabsContent value="submissions" className="pt-6">
           {formId && <FormSubmissionsPanel formId={formId} />}
         </TabsContent>
      </Tabs>
    </div>
  );
}
