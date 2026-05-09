import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formService, Form } from '../services/formService';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  FileText, 
  MoreVertical, 
  ExternalLink, 
  Trash2, 
  Copy,
  Edit3,
  Eye,
  BarChart3,
  Code2,
  ClipboardCheck
} from 'lucide-react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { logger } from '@/core/observability/logger';

interface FormListProps {
  onEdit: (id: string) => void;
  onCreate: () => void;
}

export function FormList({ onEdit, onCreate }: FormListProps) {
  const { company } = useAuth();
  const queryClient = useQueryClient();

  const { data: forms, isLoading } = useQuery({
    queryKey: ['forms', company?.id],
    queryFn: () => formService.getForms(company!.id),
    enabled: !!company?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => formService.deleteForm(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms'] });
      toast.success('Form deleted');
    },
    onError: (error: any) => {
      logger.error('Failed to delete form', { error });
      toast.error('Failed to delete form');
    }
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <div className="h-32 bg-muted rounded-t-xl" />
            <CardContent className="p-4 space-y-2">
              <div className="h-4 bg-muted w-2/3 rounded" />
              <div className="h-3 bg-muted w-1/2 rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!forms?.length) {
    return (
      <Card className="border-dashed flex flex-col items-center justify-center p-12 text-center space-y-4">
        <div className="w-16 h-16 bg-primary/5 rounded-full flex items-center justify-center">
          <FileText className="h-8 w-8 text-primary/40" />
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-lg">No forms created yet</h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            Create your first high-converting form to start capturing leads today.
          </p>
        </div>
        <Button onClick={onCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Create First Form
        </Button>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {forms.map((form) => (
        <Card key={form.id} className="group hover:shadow-md transition-all border-none shadow-sm overflow-hidden bg-card/50">
          <div className="h-2 bg-primary/20 group-hover:bg-primary transition-colors" />
          <CardHeader className="p-4 flex flex-row items-start justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base font-bold truncate max-w-[200px]">{form.name}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={form.status === 'published' ? 'default' : 'secondary'} className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0 h-4">
                  {form.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">/{form.slug}</span>
              </div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onEdit(form.id)} className="gap-2">
                  <Edit3 className="h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2">
                  <Copy className="h-4 w-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2">
                  <BarChart3 className="h-4 w-4" /> Analytics
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => deleteMutation.mutate(form.id)}>
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          
          <CardContent className="p-4 pt-0">
            <div className="flex items-center gap-4 mt-2">
              <div className="flex flex-col">
                <span className="text-xs font-bold">0</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Leads</span>
              </div>
              <div className="flex flex-col border-l pl-4">
                <span className="text-xs font-bold">0%</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Conv.</span>
              </div>
            </div>
            
            <div className="flex gap-2 mt-6">
              <Button variant="outline" size="sm" className="flex-1 text-[10px] uppercase font-bold tracking-wider h-8 gap-1.5" onClick={() => window.open(`/f/${form.slug}`, '_blank')}>
                <Eye className="h-3 w-3" /> Preview
              </Button>
              <Button variant="outline" size="sm" className="flex-1 text-[10px] uppercase font-bold tracking-wider h-8 gap-1.5">
                <ExternalLink className="h-3 w-3" /> Embed
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}