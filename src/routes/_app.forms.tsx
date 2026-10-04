import React, { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
 import { FormBuilder } from '@/modules/capture/components/FormBuilder';
 import { FormTypeSelector } from '@/modules/capture/components/FormTypeSelector';
import { FormList } from '@/modules/capture/components/FormList';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
 
 export const Route = createFileRoute('/_app/forms')({
   component: FormsPage,
 });
 
  function FormsPage() {
   const [view, setView] = useState<'list' | 'selector' | 'builder'>('list');
   const [editingId, setEditingId] = useState<string | undefined>(undefined);
   const [initialTemplate, setInitialTemplate] = useState<any>(null);
   const [selectedType, setSelectedType] = useState<'standard' | 'multi_step' | 'quiz'>('standard');
   const navigate = useNavigate();
 
   const handleCreate = () => {
     setEditingId(undefined);
     setView('selector');
   };
 
   const handleTypeSelect = (type: 'standard' | 'multi_step' | 'quiz', template?: any) => {
     /* "Quiz de Qualificação" abria o MESMO construtor de formulário.
        `initialType` só era usado para gravar `forms.type`: não existe nenhum
        ramo `type === 'quiz'` no FormBuilder, então a tela era idêntica à do
        formulário normal — e nem a aba de etapas aparecia, porque ela só é
        exibida para `multi_step`.

        O quiz tem módulo próprio e completo (`/quizzes`, com construtor,
        fluxo, pontuação, publicação e o player em `/q/$slug`). É para lá que
        a escolha deve levar. */
     if (type === 'quiz') {
       navigate({ to: '/quizzes' });
       return;
     }
     setSelectedType(type);
     setInitialTemplate(template);
     setView('builder');
   };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setView('builder');
  };

  const handleBack = () => {
    setView('list');
    setEditingId(undefined);
  };

   return (
     <div className="space-y-6">
      {view === 'list' && (
        <>
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Formulários e Captação</h1>
              <p className="text-muted-foreground text-sm">Crie e gerencie os formulários que captam seus leads.</p>
            </div>
            <Button onClick={handleCreate} className="flex items-center gap-2 shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4" />
              Criar formulário
            </Button>
          </div>
          <FormList onEdit={handleEdit} onCreate={handleCreate} />
        </>
      )}
      {view === 'selector' && (
        <FormTypeSelector onSelect={handleTypeSelect} onBack={handleBack} />
      )}
      {view === 'builder' && (
        <FormBuilder 
          formId={editingId} 
          onBack={handleBack} 
          initialType={selectedType}
          template={initialTemplate}
        />
      )}
     </div>
   );
 }