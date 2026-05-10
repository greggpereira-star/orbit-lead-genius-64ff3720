import React, { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
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
 
   const handleCreate = () => {
     setEditingId(undefined);
     setView('selector');
   };
 
   const handleTypeSelect = (type: 'standard' | 'multi_step' | 'quiz', template?: any) => {
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
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Forms & Capture</h1>
              <p className="text-muted-foreground text-sm">Create and manage your high-converting lead capture forms.</p>
            </div>
            <Button onClick={handleCreate} className="flex items-center gap-2 shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4" />
              Create Form
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