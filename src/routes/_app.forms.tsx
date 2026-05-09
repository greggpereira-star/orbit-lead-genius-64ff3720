import React, { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { FormBuilder } from '@/modules/capture/components/FormBuilder';
import { FormList } from '@/modules/capture/components/FormList';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
 
 export const Route = createFileRoute('/_app/forms')({
   component: FormsPage,
 });
 
 function FormsPage() {
  const [view, setView] = useState<'list' | 'builder'>('list');
  const [editingId, setEditingId] = useState<string | undefined>(undefined);

  const handleCreate = () => {
    setEditingId(undefined);
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
      {view === 'list' ? (
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
      ) : (
        <FormBuilder formId={editingId} onBack={handleBack} />
      )}
     </div>
   );
 }