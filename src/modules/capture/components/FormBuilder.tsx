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
   ChevronRight,
   ChevronUp,
   ChevronDown
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
import { StageSelect } from '@/modules/crm/components/StageSelect';
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

/**
 * Chave com que a resposta é gravada.
 *
 * Era `field_${index}` — posicional e invisível. Três consequências medidas:
 * as respostas ficavam gravadas como `{"field_0": "...", "field_3": "..."}`,
 * ilegíveis em `form_submissions.answers`; a resolução de contato no servidor
 * (que procura `nome`/`email`) só funcionava pelo rótulo; e havia COLISÃO —
 * apague o campo 0, adicione outro e o novo recebe `field_1`, que já pertence
 * a um campo existente. Duas chaves iguais em `answers`: uma sobrescreve a
 * outra e a resposta se perde.
 *
 * Agora sai do rótulo, com sufixo numérico quando repetir.
 */
const gerarNomeDoCampo = (rotulo: string, usados: Set<string>, posicao: number) => {
  const base = makeOptionValue(rotulo || '') || `campo_${posicao + 1}`;
  if (!usados.has(base)) return base;
  let n = 2;
  while (usados.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
};

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
    name: field.name || '',
    /* Campo que já existe no banco tem a chave CONGELADA: renomear quebraria
       as respostas já gravadas, que são indexadas por ela, e as regras de
       pontuação que apontam para o campo. Só muda se a pessoa pedir. */
    nome_travado: Boolean(field.name),
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
 
 function SortableField({ field, index, onUpdate, onRemove, steps, onAssignStep }: { 
   field: any, 
   index: number, 
   onUpdate: (index: number, data: any) => void,
   onRemove: (id: string) => void,
   /* Etapas do formulário step-by-step. Vazio = formulário de página única. */
   steps?: any[],
   onAssignStep?: (campoId: string, stepId: string) => void
 }) {
   const {
     attributes,
     listeners,
     setNodeRef,
     transform,
     transition,
     isDragging
   } = useSortable({ id: field.id });
 
   const [editandoNome, setEditandoNome] = useState(false);

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
       {/* `items-start` + `min-w-0` + quebra: a linha era `flex items-center`
           com um grid de 3 colunas fixas mais os controles à direita. No painel
           do construtor, que divide a largura com as configurações, o seletor
           de etapa saía pela borda e ficava cortado. */}
       <div className="flex items-start gap-3 w-full min-w-0">
         <div 
           {...attributes} 
           {...listeners}
           className="cursor-grab text-muted-foreground group-hover:text-primary transition-colors p-1 pt-7 shrink-0"
         >
           <GripVertical className="h-5 w-5" />
         </div>
         
         <div className="flex-1 min-w-0 grid grid-cols-1 gap-3 sm:grid-cols-2">
           <div className="space-y-1.5">
             <Label className="text-xs">Rótulo do campo</Label>
             <Input 
               value={field.label} 
               onChange={(e) => onUpdate(index, { label: e.target.value })}
               className="h-9"
             />
             {/* A chave era invisível e posicional (`field_0`, `field_3`): é
                 com ela que a resposta é gravada e lida depois. Mostrar evita
                 que o cliente só descubra ao exportar as submissões. */}
             <div className="flex items-center gap-1.5 pt-0.5">
               <span className="text-[10px] text-muted-foreground shrink-0">chave:</span>
               {editandoNome ? (
                 <Input
                   autoFocus
                   value={field.name ?? ''}
                   onChange={(e) => onUpdate(index, {
                     name: e.target.value
                       .toLowerCase()
                       .normalize('NFD')
                       .replace(/[\u0300-\u036f]/g, '')
                       .replace(/[^a-z0-9_]+/g, '_'),
                   })}
                   onBlur={() => setEditandoNome(false)}
                   className="h-6 text-[11px] font-mono px-1.5 py-0"
                 />
               ) : (
                 <button
                   type="button"
                   onClick={() => setEditandoNome(true)}
                   className="text-[11px] font-mono text-muted-foreground underline underline-offset-2 decoration-dotted truncate"
                   title="Clique para editar a chave da resposta"
                 >
                   {field.name || '—'}
                 </button>
               )}
             </div>
           </div>
           <div className="space-y-1.5">
             <Label className="text-xs">Tipo do campo</Label>
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
           <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 sm:col-span-2">
             <div className="flex items-center gap-2">
               <Switch 
                 checked={field.required} 
                 onCheckedChange={(val) => onUpdate(index, { required: val })}
               />
               <span className="text-xs font-medium">Obrigatório</span>
             </div>
             {/* Sem isto as etapas existiam e nenhum campo pertencia a
                 nenhuma: o formulário salvava com etapas e renderizava tudo
                 numa tela só. */}
             {steps && steps.length > 0 && (
               <div className="flex items-center gap-2">
                 <span className="text-xs text-muted-foreground">Etapa</span>
                 <select
                   className="h-9 rounded-md border bg-background px-2 text-sm"
                   value={field.step_id ?? ''}
                   onChange={(e) => onAssignStep?.(field.id, e.target.value)}
                 >
                   <option value="">Sem etapa</option>
                   {steps.map((s: any, i: number) => (
                     <option key={s.id} value={s.id}>{i + 1}. {s.title || `Etapa ${i + 1}`}</option>
                   ))}
                 </select>
               </div>
             )}
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
                 const normalizedOption = normalizeDropdownOption(option, optIndex);
                 const optValue = normalizedOption.label;
                 const optId = normalizedOption.id;
                
                return (
                  <div key={optId} className="flex gap-2 items-center animate-in fade-in zoom-in-95 duration-200">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                       <Input 
                        value={optValue}
                         onKeyDown={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const newOptions = [...(field.options || [])];
                            const updatedOption = { ...normalizedOption, label: e.target.value, value: makeOptionValue(e.target.value) };
                           newOptions[optIndex] = updatedOption;
                          onUpdate(index, { options: newOptions });
                        }}
                        placeholder="Rótulo da Opção"
                        className="h-8 text-xs"
                      />
                      <div className="flex gap-2">
                         <Input 
                           value={normalizedOption.score || 0}
                          type="number"
                           onKeyDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const newOptions = [...(field.options || [])];
                            const score = parseInt(e.target.value) || 0;
                              const updatedOptionScore = { ...normalizedOption, score };
                             newOptions[optIndex] = updatedOptionScore;
                            onUpdate(index, { options: newOptions });
                          }}
                          placeholder="Score"
                          className="h-8 text-xs w-16"
                        />
                         <Input 
                           value={normalizedOption.tag || ''}
                           onKeyDown={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const newOptions = [...(field.options || [])];
                              const updatedOptionTag = { ...normalizedOption, tag: e.target.value };
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
   /* `nome_travado` é só do editor: diz que a chave do campo não deve
      acompanhar o rótulo. Não é coluna do banco. */
   const [fields, setFields] = useState<(Partial<FormField> & { id: string; nome_travado?: boolean })[]>([]);
   const [steps, setSteps] = useState<any[]>([]);
    const [showTemplates, setShowTemplates] = useState(!formId);
  const [formConfig, setFormConfig] = useState<Partial<Form>>({
    name: 'Formulário sem nome',
    slug: '',
    status: 'draft',
    type: initialType || 'standard',
    settings: {
      submit_label: 'Enviar',
      success_message: 'Recebemos seus dados. Entraremos em contato em breve.',
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
        setSteps([...(existingForm.form_steps || [])].sort((a, b) => a.sort_order - b.sort_order));
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
          const generatedSteps = template.steps.map((step: any, sIdx: number) => ({
            id: crypto.randomUUID(),
            title: step.title || `Etapa ${sIdx + 1}`,
            description: step.description || '',
            sort_order: sIdx,
            button_text: step.button_text || 'Avançar',
            conditional_logic: step.conditional_logic || {}
          }));
          setSteps(generatedSteps);
          template.steps.forEach((step: any, sIdx: number) => {
            const stepId = generatedSteps[sIdx].id;
            step.fields.forEach((field: any) => {
              newFields.push({
                ...field,
                id: crypto.randomUUID(),
                step_id: stepId,
                step_number: sIdx + 1
              });
            });
          });
          setFields(newFields.map(normalizeFieldForEditor));
        } else if (template.fields) {
          setSteps([]);
          setFields(template.fields.map((f: any, index: number) => normalizeFieldForEditor({
            ...f,
            id: crypto.randomUUID()
          }, index)));
        }
        setShowTemplates(false);
      } else {
        setShowTemplates(false);
      }
    }
  }, [existingForm, formId, template, initialType]);

    /* --- Etapas ---------------------------------------------------------
       `sort_order` é sempre reescrito a partir da posição no array: era o que
       o `save_form_builder_v1` usava para ordenar, e deixar o valor antigo
       faria a reordenação na tela não surtir efeito no formulário público. */
    const normalizarOrdem = (lista: any[]) =>
      lista.map((s, i) => ({ ...s, sort_order: i }));

    const adicionarEtapa = () => {
      setSteps((atuais) => normalizarOrdem([
        ...atuais,
        {
          id: crypto.randomUUID(),
          title: `Etapa ${atuais.length + 1}`,
          description: '',
          button_text: 'Avançar',
          conditional_logic: {},
        },
      ]));
    };

    const atualizarEtapa = (idx: number, patch: Record<string, unknown>) => {
      setSteps((atuais) => atuais.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
    };

    const moverEtapa = (idx: number, direcao: -1 | 1) => {
      setSteps((atuais) => {
        const destino = idx + direcao;
        if (destino < 0 || destino >= atuais.length) return atuais;
        const copia = [...atuais];
        [copia[idx], copia[destino]] = [copia[destino], copia[idx]];
        return normalizarOrdem(copia);
      });
    };

    const removerEtapa = (idx: number) => {
      const etapa = steps[idx];
      if (!etapa) return;
      const restantes = normalizarOrdem(steps.filter((_, i) => i !== idx));
      /* Campo órfão não aparece em etapa nenhuma e some do formulário sem
         aviso. Os campos da etapa removida vão para a primeira que sobrar; se
         não sobrar nenhuma, ficam sem etapa e o formulário vira página única. */
      const destino = restantes[0];
      setFields((atuais) => atuais.map((f: any) =>
        f.step_id === etapa.id
          ? { ...f, step_id: destino?.id, step_number: destino ? 1 : 1 }
          : f,
      ));
      setSteps(restantes);
    };

    const atribuirCampoAEtapa = (campoId: string, stepId: string) => {
      const indice = steps.findIndex((s) => s.id === stepId);
      setFields((atuais) => atuais.map((f: any) =>
        f.id === campoId ? { ...f, step_id: stepId, step_number: indice >= 0 ? indice + 1 : 1 } : f,
      ));
    };

    /* Step-by-step sem nenhuma etapa não tem como funcionar: semeia a
       primeira para que a aba Steps abra com algo e os campos tenham onde
       entrar. */
    useEffect(() => {
      if (formConfig.type === 'multi_step' && steps.length === 0 && !isLoading) {
        setSteps([{
          id: crypto.randomUUID(),
          title: 'Etapa 1',
          description: '',
          button_text: 'Avançar',
          conditional_logic: {},
          sort_order: 0,
        }]);
      }
    }, [formConfig.type, steps.length, isLoading]);

    /* Mantém as chaves coerentes enquanto a pessoa edita: campo novo acompanha
       o rótulo, campo já salvo (ou renomeado à mão) não é tocado, e nenhuma
       chave se repete dentro do mesmo formulário. */
    const nomesAtualizados = (lista: any[]) => {
      const usados = new Set<string>();
      // Primeiro os travados, que têm prioridade sobre a chave que já ocupam.
      for (const f of lista) if (f.nome_travado && f.name) usados.add(f.name);
      return lista.map((f, i) => {
        if (f.nome_travado && f.name) return f;
        const novo = gerarNomeDoCampo(f.label, usados, i);
        usados.add(novo);
        return f.name === novo ? f : { ...f, name: novo };
      });
    };

    const atualizarCampo = (index: number, data: any) => {
      setFields((atuais) => {
        const copia = [...atuais];
        copia[index] = { ...copia[index], ...data };
        /* Editar a chave à mão trava: a partir daí o rótulo não a sobrescreve
           mais, senão a escolha da pessoa sumiria na próxima letra digitada. */
        if (Object.prototype.hasOwnProperty.call(data, 'name')) {
          copia[index].nome_travado = true;
        }
        return nomesAtualizados(copia);
      });
    };

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
          const fieldsToUpsert = fields.map((f, index) => ({
            id: f.id,
            label: f.label || 'Campo',
            // Sem `field_${index}` de reserva: o estado já garante chave única
            // e legível. O fallback posicional era a origem da colisão.
            name: f.name || gerarNomeDoCampo(f.label || '', new Set(), index),
            type: f.type || 'text',
            required: !!f.required,
            placeholder: f.placeholder || '',
            options: Array.isArray(f.options) ? f.options.map(normalizeDropdownOption) : [],
            sort_order: index,
            step_number: f.step_number || 1,
            step_id: f.step_id && f.step_id.length > 20 ? f.step_id : undefined,
            validation_rules: f.validation_rules || {},
            logic_rules: f.logic_rules || {},
            score_rules: f.score_rules || {}
          }));

          const optionsByField = fields
            .filter((field) => field.type === 'select' && field.id)
            .map((field) => ({
              field_id: field.id,
              options: Array.isArray(field.options) ? field.options.map(normalizeDropdownOption) : []
            }));

          logger.info(`[${traceId}] Saving Form Builder atomically`, {
            fieldCount: fieldsToUpsert.length,
            dropdownFieldCount: optionsByField.length,
            optionCount: optionsByField.reduce((total, item) => total + item.options.length, 0),
          });

          /* A ordem das etapas e o `step_number` de cada campo são derivados
             da posição no momento de salvar. O `step_number` ficava no valor
             com que o campo nasceu, então reordenar etapas na tela não mudava
             a ordem no formulário público. */
          const stepsParaSalvar = steps.map((s: any, i: number) => ({ ...s, sort_order: i }));
          const indicePorStepId = new Map(stepsParaSalvar.map((s: any, i: number) => [s.id, i + 1]));
          for (const f of fieldsToUpsert) {
            const n = f.step_id ? indicePorStepId.get(f.step_id) : undefined;
            f.step_number = n ?? 1;
          }

          const saveResult = await formService.saveFormBuilder({
            formId: formId || undefined,
            companyId: company.id,
            formData: {
              name: formConfig.name || 'Formulário sem nome',
              slug: formConfig.slug || `form-${Date.now()}`,
              description: formConfig.description,
              status: formConfig.status || 'draft',
              settings: formConfig.settings,
              type: formConfig.type || 'standard'
            },
            fields: fieldsToUpsert,
            steps: stepsParaSalvar,
            optionsByField
          });

          const duration = Date.now() - startedAt;
          logger.info(`[${traceId}] Save Complete`, { duration_ms: duration, db_trace_id: saveResult.trace_id, saved: saveResult });
          
          return saveResult.form_id;
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
       options: [],
       name: '',
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
      setFields(template.fields.map((f: any, index: number) => normalizeFieldForEditor({
       ...f,
      id: crypto.randomUUID()
      }, index)));
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
            <CardTitle className="text-xl font-bold">{formId ? 'Editar formulário' : 'Novo formulário'}</CardTitle>
            <CardDescription>Campos, etapas, pontuação e publicação</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onBack}>Cancelar</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar formulário
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
                    <CardTitle className="text-lg font-semibold">Campos do formulário</CardTitle>
                    <CardDescription>Arraste para reordenar</CardDescription>
                  </div>
                  <Button onClick={addField} size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Adicionar campo
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
                           steps={formConfig.type === 'multi_step' ? steps : []}
                           onAssignStep={atribuirCampoAEtapa}
                           onRemove={removeField}
                           onUpdate={atualizarCampo}
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
                    <CardTitle className="text-base">Configurações</CardTitle>
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-xs">Nome do formulário</Label>
                      <Input 
                        value={formConfig.name} 
                        onChange={(e) => setFormConfig(prev => ({...prev, name: e.target.value}))}
                        placeholder="Ex: Contato do site" 
                      />
                    </div>
                    {/* Título que o LEAD vê, separado do nome do formulário.
                        Não havia campo nenhum para isto: o nome interno é que
                        aparecia para o visitante, e no teste do site da Exata
                        saiu "TESTE WORDPRESS - pode apagar" na tela de quem ia
                        preencher. */}
                    <div className="space-y-2">
                      <Label className="text-xs">Título visível para quem preenche</Label>
                      <Input
                        value={(formConfig.settings as any)?.titulo_publico ?? ''}
                        placeholder="Ex: Fale com um especialista"
                        onChange={(e) => setFormConfig(prev => ({
                          ...prev,
                          settings: { ...(prev.settings as any), titulo_publico: e.target.value },
                        }))}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Vazio, o formulário começa direto nos campos. O nome acima é só
                        para você encontrar o formulário nesta lista.
                      </p>
                    </div>

                    {/* Cor de destaque, para o formulário não destoar do site
                        do cliente. Vale para o botão, a barra de progresso e o
                        foco dos campos — botão de uma cor e foco de outra
                        parece erro de montagem. */}
                    <div className="space-y-2">
                      <Label className="text-xs">Cor do botão</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={(formConfig.settings as any)?.cor_botao || '#2563eb'}
                          onChange={(e) => setFormConfig(prev => ({
                            ...prev,
                            settings: { ...(prev.settings as any), cor_botao: e.target.value },
                          }))}
                          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1"
                          aria-label="Escolher a cor do botão"
                        />
                        <Input
                          value={(formConfig.settings as any)?.cor_botao ?? ''}
                          placeholder="#2563eb — vazio usa a cor padrão"
                          onChange={(e) => setFormConfig(prev => ({
                            ...prev,
                            settings: { ...(prev.settings as any), cor_botao: e.target.value },
                          }))}
                          className="font-mono text-sm"
                        />
                        {(formConfig.settings as any)?.cor_botao && (
                          <Button
                            type="button" variant="ghost" size="sm" className="h-9 shrink-0 text-xs"
                            onClick={() => setFormConfig(prev => {
                              const s = { ...(prev.settings as any) };
                              delete s.cor_botao;
                              return { ...prev, settings: s };
                            })}
                          >
                            Limpar
                          </Button>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        A cor do texto do botão é escolhida sozinha, pelo contraste — branco
                        sobre cor escura, preto sobre cor clara.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Linha de apoio (opcional)</Label>
                      <Input
                        value={(formConfig.settings as any)?.subtitulo_publico ?? ''}
                        placeholder="Ex: Respondemos em até 1 dia útil"
                        onChange={(e) => setFormConfig(prev => ({
                          ...prev,
                          settings: { ...(prev.settings as any), subtitulo_publico: e.target.value },
                        }))}
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
                    {/* LGPD ------------------------------------------------
                        O formulário público não pedia consentimento nenhum.
                        O componente que existia era usado só pelo formulário de
                        dentro do painel, estava em inglês e nascia com as
                        caixas marcadas — o oposto do que o art. 8º pede. */}
                    <div className="space-y-3 rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Label className="text-xs font-semibold">Pedir consentimento (LGPD)</Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            O envio só é aceito com a autorização marcada. A checagem
                            também roda no servidor.
                          </p>
                        </div>
                        <Switch
                          checked={Boolean((formConfig.settings as any)?.lgpd_exigir_consentimento)}
                          onCheckedChange={(v) => setFormConfig(prev => ({
                            ...prev,
                            settings: { ...(prev.settings as any), lgpd_exigir_consentimento: v },
                          }))}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Texto mostrado ao lead</Label>
                        <Input
                          value={(formConfig.settings as any)?.lgpd_texto ?? ''}
                          placeholder="Autorizo o tratamento dos meus dados para que entrem em contato comigo."
                          onChange={(e) => setFormConfig(prev => ({
                            ...prev,
                            settings: { ...(prev.settings as any), lgpd_texto: e.target.value },
                          }))}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          O texto exibido fica gravado junto com o consentimento: se você
                          mudar a redação depois, os registros antigos continuam provando
                          o que a pessoa leu naquele dia.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[11px] text-muted-foreground">Link da Política de Privacidade</Label>
                        <Input
                          value={(formConfig.settings as any)?.lgpd_politica_url ?? ''}
                          placeholder="https://seusite.com.br/privacidade"
                          onChange={(e) => setFormConfig(prev => ({
                            ...prev,
                            settings: { ...(prev.settings as any), lgpd_politica_url: e.target.value },
                          }))}
                        />
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Label className="text-[11px] text-muted-foreground">
                            Pedir aceite de marketing (opcional)
                          </Label>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Caixa separada e não obrigatória. Atender o contato e enviar
                            promoção são finalidades distintas.
                          </p>
                        </div>
                        <Switch
                          checked={Boolean((formConfig.settings as any)?.lgpd_pedir_marketing)}
                          onCheckedChange={(v) => setFormConfig(prev => ({
                            ...prev,
                            settings: { ...(prev.settings as any), lgpd_pedir_marketing: v },
                          }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs">Texto do botão de envio</Label>
                      <Input 
                        value={formConfig.settings?.submit_label} 
                        onChange={(e) => setFormConfig(prev => {
                          const currentSettings = prev.settings || {
                            submit_label: 'Enviar',
                            success_message: 'Recebemos seus dados. Entraremos em contato em breve.',
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
                        <Label className="text-xs">Capturar UTMs</Label>
                        <p className="text-[10px] text-muted-foreground">Guarda a origem da visita junto com o lead</p>
                      </div>
                      <Switch 
                        checked={formConfig.settings?.capture_utms} 
                        onCheckedChange={(val) => setFormConfig(prev => {
                          const currentSettings = prev.settings || {
                            submit_label: 'Enviar',
                            success_message: 'Recebemos seus dados. Entraremos em contato em breve.',
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
                        <Label className="text-xs">Publicado</Label>
                        <p className="text-[10px] text-muted-foreground">Fora disso o formulário não abre para ninguém</p>
                      </div>
                      <Switch 
                        checked={formConfig.status === 'published'} 
                        onCheckedChange={(val) => setFormConfig(prev => ({
                          ...prev, 
                          status: val ? 'published' : 'draft'
                        }))}
                      />
                    </div>

                    {/* Etapa de entrada no pipeline. Sem ela, o lead capturado
                        por este formulário nascia com stage_id NULL e não
                        aparecia em coluna nenhuma do board. */}
                    <div className="space-y-2 pt-4 border-t">
                      <Label className="text-xs">Etapa de entrada no pipeline</Label>
                      <StageSelect
                        companyId={company?.id ?? ''}
                        value={(formConfig.settings as Record<string, unknown> | undefined)?.default_stage_id as string ?? null}
                        onChange={(stageId) => setFormConfig(prev => {
                          const currentSettings = prev.settings || {
                            submit_label: 'Enviar',
                            success_message: 'Recebemos seus dados. Entraremos em contato em breve.',
                            theme: 'premium-light',
                            cv_crm_integration: false,
                            capture_utms: true
                          };
                          const next = { ...currentSettings } as Record<string, unknown>;
                          // Remove a chave quando volta ao padrão, em vez de
                          // guardar null — uma etapa excluída deixaria um id
                          // órfão apontando pra lugar nenhum.
                          if (stageId) next.default_stage_id = stageId;
                          else delete next.default_stage_id;
                          return { ...prev, settings: next as typeof currentSettings };
                        })}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Em que coluna do pipeline os leads deste formulário aparecem.
                      </p>
                    </div>

                    {/* Pixel próprio deste formulário. Campo vazio herda o da
                        empresa — tratar vazio como "sem medição" faria todo
                        formulário novo nascer invisível para as campanhas. */}
                    <div className="space-y-2 pt-4 border-t">
                      <Label className="text-xs">Medição só deste formulário</Label>
                      {([
                        ['meta_pixel_id', 'ID do Pixel do Meta'],
                        ['google_conversion_id', 'ID de conversão do Google Ads'],
                        ['google_lead_label', 'Rótulo da conversão'],
                      ] as const).map(([key, label]) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">{label}</Label>
                          <Input
                            value={((formConfig.settings as Record<string, unknown> | undefined)?.[key] as string) ?? ''}
                            placeholder="Herda o da empresa"
                            onChange={(e) => setFormConfig(prev => {
                              const currentSettings = prev.settings || {
                                submit_label: 'Submit',
                                success_message: 'Thank you!',
                                theme: 'premium-light',
                                cv_crm_integration: false,
                                capture_utms: true
                              };
                              const next = { ...currentSettings } as Record<string, unknown>;
                              const value = e.target.value.trim();
                              if (value) next[key] = value;
                              else delete next[key];
                              return { ...prev, settings: next as typeof currentSettings };
                            })}
                          />
                        </div>
                      ))}
                      <p className="text-[10px] text-muted-foreground">
                        O pixel da empresa fica em Configurações → Integrações e vale para todos os funis.
                      </p>
                    </div>

                    <div className="space-y-4 pt-4 border-t">
                      <Label className="text-[10px] uppercase font-bold tracking-widest opacity-70">Post-Submission</Label>
                      <div className="space-y-2">
                        <Label className="text-xs">Mensagem de sucesso</Label>
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
                       <Label className="text-xs">Redirecionar após o envio (opcional)</Label>
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
                        <Label className="text-xs">WhatsApp (opcional)</Label>
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
            {/* Esta aba era uma maquete: o botão "Adicionar Etapa" não tinha
                `onClick`, a lista lia `template?.steps` em vez do estado
                `steps`, e o "Etapa 1 / Dados iniciais" que aparecia era o
                literal do fallback. Nada podia ser criado, editado ou
                reordenado. O backend (`save_form_builder_v1`) já persistia
                etapas corretamente — só faltava a tela. */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold tracking-[-0.01em]">Gerenciar etapas</h3>
                  <p className="text-sm text-muted-foreground">
                    Cada etapa é uma tela do formulário. Os campos são distribuídos na aba Builder.
                  </p>
                </div>
                <Button size="sm" className="gap-2" onClick={adicionarEtapa}>
                  <Plus className="h-4 w-4" /> Adicionar etapa
                </Button>
              </div>

              {steps.length === 0 ? (
                <div className="rounded-xl border border-dashed p-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nenhuma etapa ainda. Um formulário step-by-step precisa de pelo menos uma.
                  </p>
                  <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={adicionarEtapa}>
                    <Plus className="h-4 w-4" /> Criar a primeira
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {steps.map((step: any, idx: number) => {
                    const camposDaEtapa = fields.filter((f: any) => f.step_id === step.id).length;
                    return (
                      <Card key={step.id || idx} className="p-4 space-y-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 h-8 w-8 shrink-0 rounded-full bg-primary/10 grid place-items-center text-primary font-semibold text-sm tabular-nums">
                            {idx + 1}
                          </div>
                          <div className="min-w-0 flex-1 grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-[11px] font-semibold text-muted-foreground">Título</Label>
                              <Input
                                value={step.title ?? ''}
                                placeholder={`Etapa ${idx + 1}`}
                                onChange={(e) => atualizarEtapa(idx, { title: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] font-semibold text-muted-foreground">Descrição</Label>
                              <Input
                                value={step.description ?? ''}
                                placeholder="Opcional"
                                onChange={(e) => atualizarEtapa(idx, { description: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] font-semibold text-muted-foreground">Texto do botão</Label>
                              <Input
                                value={step.button_text ?? ''}
                                placeholder="Avançar"
                                onChange={(e) => atualizarEtapa(idx, { button_text: e.target.value })}
                              />
                            </div>
                            <div className="flex items-end">
                              <p className="text-xs text-muted-foreground">
                                {camposDaEtapa === 0
                                  ? 'Nenhum campo nesta etapa'
                                  : `${camposDaEtapa} campo${camposDaEtapa > 1 ? 's' : ''} nesta etapa`}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <Button
                              type="button" variant="ghost" size="icon" className="h-7 w-7"
                              disabled={idx === 0}
                              onClick={() => moverEtapa(idx, -1)}
                              aria-label="Mover etapa para cima"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button" variant="ghost" size="icon" className="h-7 w-7"
                              disabled={idx === steps.length - 1}
                              onClick={() => moverEtapa(idx, 1)}
                              aria-label="Mover etapa para baixo"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button" variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => removerEtapa(idx)}
                              aria-label="Remover etapa"
                            >
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
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
            {formId && <FormSubmissionsPanel formId={formId} formName={formConfig.name} />}
          </TabsContent>
      </Tabs>
    </div>
  );
}
