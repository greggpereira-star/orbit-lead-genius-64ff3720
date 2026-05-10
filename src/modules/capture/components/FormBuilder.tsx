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
   Workflow,
   Layers,
   Trophy,
   Target,
   ChevronRight
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
import { FormScoringPanel } from './FormScoringPanel';

const makeOptionValue = (label: string) =>
  label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeDropdownOption = (option: any, index: number) => {
  if (typeof option === 'string') {
    return {
      id: crypto.randomUUID(),
      label: option,
      value: makeOptionValue(option),
      score: 0,
      tag: null,
      sort_order: index,
      metadata: {}
    };
  }

  const label = option?.label || option?.value || `Opção ${index + 1}`;
  return {
    ...option,
    id: option?.id || crypto.randomUUID(),
    label,
    value: option?.value || makeOptionValue(label),
    score: Number(option?.score || 0),
    tag: option?.tag ?? null,
    sort_order: index,
    metadata: option?.metadata || {}
  };
};

const normalizeFieldForEditor = (field: any, index: number) => {
  const persistedOptions = Array.isArray(field.options_data) && field.options_data.length > 0
    ? field.options_data
    : Array.isArray(field.options)
      ? field.options
      : [];

  return {
    ...field,
    id: field.id || crypto.randomUUID(),
    name: field.name || `field_${index}`,
    sort_order: index,
    options: persistedOptions.map(normalizeDropdownOption)
  };
};

  interface FormBuilderProps {
    formId?: string;
    onBack: () => void;
    initialType?: 'standard' | 'multi_step' | 'quiz';
    template?: any;
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
                const currentOptions = Array.isArray(field.options) ? field.options : [];
                const newOption = {
                  id: crypto.randomUUID(),
                  label: `Opção ${currentOptions.length + 1}`,
                  value: `opcao_${currentOptions.length + 1}`,
                  score: 0,
                  tag: null
                };
                onUpdate(index, { options: [...currentOptions, newOption] });
               }}
             >
               <Plus className="h-3 w-3" /> Adicionar Opção
             </Button>
           </div>
           
            <div className="space-y-2">
              {(Array.isArray(field.options) ? field.options : []).map((option: any, optIndex: number) => {
                const optValue = typeof option === 'string' ? option : (option.label || '');
                const optId = typeof option === 'string' ? optIndex : (option.id || optIndex);
                
                return (
                  <div key={optId} className="flex gap-2 items-center animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <Input 
                        value={optValue}
                        onChange={(e) => {
                          const newOptions = [...(field.options || [])];
                           const updatedOption = typeof option === 'string' 
                             ? { label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_'), id: crypto.randomUUID() }
                             : { ...option, label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') };
                           newOptions[optIndex] = updatedOption;
                          onUpdate(index, { options: newOptions });
                        }}
                        placeholder="Rótulo da Opção"
                        className="h-8 text-xs"
                      />
                      <div className="flex gap-2">
                        <Input 
                          value={typeof option === 'string' ? '' : (option.score || 0)}
                          type="number"
                          onChange={(e) => {
                            const newOptions = [...(field.options || [])];
                            const score = parseInt(e.target.value) || 0;
                             const updatedOptionScore = typeof option === 'string'
                               ? { label: option, score, value: option.toLowerCase().replace(/\s+/g, '_'), id: crypto.randomUUID() }
                               : { ...option, score };
                             newOptions[optIndex] = updatedOptionScore;
                            onUpdate(index, { options: newOptions });
                          }}
                          placeholder="Score"
                          className="h-8 text-xs w-16"
                        />
                        <Input 
                          value={typeof option === 'string' ? '' : (option.tag || '')}
                          onChange={(e) => {
                            const newOptions = [...(field.options || [])];
                             const updatedOptionTag = typeof option === 'string'
                               ? { label: option, tag: e.target.value, value: option.toLowerCase().replace(/\s+/g, '_'), id: crypto.randomUUID() }
                               : { ...option, tag: e.target.value };
                             newOptions[optIndex] = updatedOptionTag;
                            onUpdate(index, { options: newOptions });
                          }}
                          placeholder="Tag"
                          className="h-8 text-xs flex-1"
                        />
                      </div>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => {
                        const newOptions = [...(field.options || [])];
                        newOptions.splice(optIndex, 1);
                        onUpdate(index, { options: newOptions });
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            {(!field.options || field.options.length === 0) && (
              <p className="text-[10px] text-muted-foreground italic">Nenhuma opção cadastrada. Clique em adicionar para começar.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
  }
  
  export function FormBuilder({ formId, onBack, initialType, template }: FormBuilderProps) {
   const [originalData, setOriginalData] = useState<{ config: any, fields: any[] } | null>(null);
 
  const { company } = useAuth();
  const queryClient = useQueryClient();
   const [fields, setFields] = useState<(Partial<FormField> & { id: string })[]>([]);
    const [showTemplates, setShowTemplates] = useState(!formId);
  const [formConfig, setFormConfig] = useState<Partial<Form>>({
    name: 'Untitled Form',
    slug: '',
    status: 'draft',
    type: initialType || 'standard',
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
       const sortedFields = existingForm.form_fields
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(normalizeFieldForEditor);
       
       setFormConfig(existingForm);
       setFields(sortedFields);
       setOriginalData({ config: existingForm, fields: JSON.parse(JSON.stringify(sortedFields)) });
       setShowTemplates(false);
     } else if (!formId) {
      if (template) {
        setFormConfig(prev => ({
          ...prev,
          name: template.name,
          type: template.type || initialType || 'standard',
          settings: { ...prev.settings, ...template.settings }
        }));
        
        if (template.steps) {
          const newFields: any[] = [];
          template.steps.forEach((step: any, sIdx: number) => {
            step.fields.forEach((field: any) => {
              newFields.push({
                ...field,
                id: crypto.randomUUID(),
                step_id: `step_${sIdx}`
              });
            });
          });
          setFields(newFields.map(normalizeFieldForEditor));
        } else if (template.fields) {
          setFields(template.fields.map((f: any) => normalizeFieldForEditor({
            ...f,
            id: crypto.randomUUID()
          }, 0)));
        }
        setShowTemplates(false);
      } else {
        setShowTemplates(false);
      }
    }
  }, [existingForm, formId, template, initialType]);

    const [isSaving, setIsSaving] = useState(false);

    const saveMutation = useMutation({
      mutationFn: async () => {
        const traceId = `save_${Math.random().toString(36).substring(2, 10)}`;
        const startedAt = Date.now();
        
        if (!company?.id) {
          throw new Error('Empresa não identificada. Por favor, recarregue a página.');
        }
        
        setIsSaving(true);

        try {
          // 1. Save CORE
          logger.info(`[${traceId}] Step 1: Saving Form Core`);
          const savedFormId = await formService.saveFormCore({
            formId: formId || undefined,
            companyId: company.id,
            name: formConfig.name || 'Untitled Form',
            slug: formConfig.slug || `form-${Date.now()}`,
            description: formConfig.description,
            status: formConfig.status || 'draft',
            settings: formConfig.settings,
            type: formConfig.type
          });

          // 2. Compute Fields Delta
          const fieldsToDelete = originalData?.fields
            .filter(of => !fields.some(f => f.id === of.id))
            .map(of => of.id) || [];
          
          const fieldsToUpsert = fields.map((f, index) => ({
            id: f.id,
            label: f.label || 'Campo',
            name: f.name || `field_${index}`,
            type: f.type || 'text',
            required: !!f.required,
            placeholder: f.placeholder || '',
            sort_order: index,
            step_number: f.step_number || 1,
            step_id: f.step_id && f.step_id.length > 20 ? f.step_id : undefined,
            validation_rules: f.validation_rules || {},
            logic_rules: f.logic_rules || {},
            score_rules: f.score_rules || {}
          }));

          logger.info(`[${traceId}] Step 2: Saving Fields Delta`, { 
            upsertCount: fieldsToUpsert.length, 
            deleteCount: fieldsToDelete.length 
          });

          await formService.saveFormFieldsDelta({
            formId: savedFormId,
            companyId: company.id,
            fieldsUpsert: fieldsToUpsert,
            fieldsDelete: fieldsToDelete
          });

          // 3. Save Options Delta for SELECT fields
          const selectFields = fields.filter(f => f.type === 'select');
          
          for (const field of selectFields) {
            const fieldId = field.id;
            if (!fieldId) continue;

            // Snapshot original para computar delta de opções
            const originalField = originalData?.fields.find(of => of.id === fieldId);
            const originalOptions = Array.isArray(originalField?.options_data) ? originalField.options_data : [];
            
            // Garante que currentOptions é um array de objetos estruturados
            const currentOptions = Array.isArray(field.options) ? field.options.map((opt: any, index: number) => {
              if (typeof opt === 'string') {
                return {
                  id: crypto.randomUUID(), // Opções legacy como string ganham ID
                  label: opt,
                  value: opt.toLowerCase().replace(/\s+/g, '_'),
                  sort_order: index,
                  score: 0
                };
              }
              return {
                ...opt,
                id: opt.id || crypto.randomUUID(),
                sort_order: index
              };
            }) : [];

            const optionsToDelete = originalOptions
              .filter((oo: any) => oo.id && !currentOptions.some((co: any) => co.id === oo.id))
              .map((oo: any) => oo.id);
            
            const optionsToUpsert = currentOptions.map((opt: any, index: number) => ({
              id: opt.id || crypto.randomUUID(),
              label: opt.label || '',
              value: opt.value || (opt.label ? opt.label.toLowerCase().replace(/\s+/g, '_') : ''),
              score: opt.score || 0,
              tag: opt.tag || null,
              sort_order: index,
              metadata: opt.metadata || {}
            }));

            // Só envia se houver mudança real para evitar requests desnecessários
            const hasChanges = optionsToUpsert.length > 0 || optionsToDelete.length > 0;
            
            if (hasChanges) {
              logger.info(`[${traceId}] Step 3: Saving Options for field ${field.label}`, {
                upsertCount: optionsToUpsert.length,
                deleteCount: optionsToDelete.length
              });
              await formService.saveFieldOptionsDelta({
                formId: savedFormId,
                companyId: company.id,
                fieldId: fieldId,
                optionsUpsert: optionsToUpsert,
                optionsDelete: optionsToDelete
              });
            }
          }

          const duration = Date.now() - startedAt;
          logger.info(`[${traceId}] Save Complete`, { duration_ms: duration });
          
          return savedFormId;
        } catch (err: any) {
          setIsSaving(false);
          const duration = Date.now() - startedAt;
          logger.error(`[${traceId}] Save Failed`, { error: err.message, duration_ms: duration });
          
          const enhancedError = new Error(err.message || 'Erro ao salvar formulário');
          (enhancedError as any).traceId = traceId;
          throw enhancedError;
        } finally {
          setIsSaving(false);
        }
      },
    onSuccess: () => {
      // Precise invalidation: only invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['forms', company?.id] });
      if (formId) {
        queryClient.invalidateQueries({ queryKey: ['form', formId] });
      }
      
      toast.success(formId ? 'Formulário atualizado com sucesso' : 'Formulário criado com sucesso');
      // Apenas volta se não for edição (criação)
      if (!formId) {
        onBack();
      } else {
        // Se for edição, apenas atualiza o snapshot original para que o próximo save delta seja correto
        setOriginalData({ 
          config: formConfig, 
          fields: JSON.parse(JSON.stringify(fields)) 
        });
      }
    },
    onError: (error: any) => {
      const traceId = error.traceId || 'N/A';
      const message = error.message || 'Erro inesperado na comunicação com o servidor';
      
      console.error(`[Save Error] Trace: ${traceId}`, error);

      toast.error(`Falha no salvamento`, {
        description: (
          <div className="space-y-2 mt-1">
            <p className="text-xs font-medium text-destructive">{message}</p>
            <div className="flex items-center gap-2 pt-1 border-t border-destructive/20">
              <span className="text-[10px] opacity-70 uppercase font-bold tracking-tighter">ID do Erro:</span>
              <code className="text-[10px] bg-destructive/10 px-1 rounded font-mono">{traceId}</code>
            </div>
            <p className="text-[10px] text-muted-foreground italic">
              Um rascunho local foi salvo. Se o erro persistir, informe este ID ao suporte.
            </p>
          </div>
        ),
        duration: 10000,
      });
    }
  });

   const addField = () => {
    const id = crypto.randomUUID();
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
      id: crypto.randomUUID()
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
           {formConfig.type === 'multi_step' && (
             <TabsTrigger 
               value="steps" 
               className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-2 gap-2"
             >
               <Layers className="h-4 w-4" /> Steps
             </TabsTrigger>
           )}
           <TabsTrigger 
             value="scoring" 
             className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-2 gap-2"
           >
             <Trophy className="h-4 w-4" /> Scoring
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
                           const val = e.target.value.trim();
                           setFormConfig(prev => {
                             const currentSettings = prev.settings || {
                               submit_label: 'Submit',
                               success_message: 'Thank you!',
                               theme: 'premium-light',
                               cv_crm_integration: false,
                               capture_utms: true
                             };
                             return {
                               ...prev,
                               settings: {
                                 ...currentSettings,
                                 redirect_url: val
                               }
                             };
                           });
                         }}
                         placeholder="https://api.whatsapp.com/send?phone=..."
                       />
                       <p className="text-[10px] text-muted-foreground">Cole o link completo do WhatsApp ou página de obrigado. O sistema agora suporta URLs longas e complexas.</p>
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

          <TabsContent value="steps" className="pt-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold">Gerenciar Etapas</h3>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" /> Adicionar Etapa
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {(template?.steps || [{ title: 'Etapa 1', description: 'Dados iniciais' }]).map((step: any, idx: number) => (
                  <Card key={idx} className="border-none shadow-sm p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                        {idx + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm">{step.title}</h4>
                        <p className="text-xs text-muted-foreground">{step.description || 'Sem descrição'}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon"><Settings2 className="h-4 w-4" /></Button>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scoring" className="pt-6">
            {formId && company?.id && (
              <FormScoringPanel 
                formId={formId} 
                companyId={company.id} 
                fields={fields} 
              />
            )}
            {!formId && (
              <div className="p-8 text-center bg-muted/30 rounded-xl border-dashed border-2">
                <p className="text-muted-foreground">Salve o formulário primeiro para configurar o Scoring.</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="submissions" className="pt-6">
            {formId && <FormSubmissionsPanel formId={formId} />}
          </TabsContent>
      </Tabs>
    </div>
  );
}
