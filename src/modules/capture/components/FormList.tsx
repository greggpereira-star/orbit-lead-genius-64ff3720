import { FormPublish } from './FormPublish';
function EmbedDialog({ form }: { form: Form }) {
  /* Esta tela era uma SEGUNDA implementação de publicação, divergente da que
     fica dentro do construtor: três opções (iFrame, link, WordPress), em
     inglês, e sem nenhum dos canais novos. Duas telas para a mesma coisa
     divergem na primeira mudança — e divergiram.

     Agora reusa o `FormPublish`, que é a tela de verdade. */
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-[10px] uppercase font-bold tracking-wider h-10 gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Code2 className="h-3 w-3" /> Publicar
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-3xl max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg">Publicar: {form.name}</DialogTitle>
          <DialogDescription>
            Escolha por onde este formulário vai receber leads.
          </DialogDescription>
        </DialogHeader>
        <FormPublish form={form} />
      </DialogContent>
    </Dialog>
  );
}
 import React from 'react';
 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { formMetrics, formService, Form } from '../services/formService';
 import { useAuth } from '@/core/auth/hooks/useAuth';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Label } from '@/components/ui/label';
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
   ClipboardCheck,
   AlertCircle,
   RefreshCcw,
   CheckCircle2
 } from 'lucide-react';
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
 import { Input } from '@/components/ui/input';
 import { toast } from 'sonner';
 import { logger } from '@/core/observability/logger';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';

interface FormListProps {
  onEdit: (id: string) => void;
  onCreate: () => void;
}

export function FormList({ onEdit, onCreate }: FormListProps) {
  const { company } = useAuth();
  const queryClient = useQueryClient();

   /* Os números do cartão eram `0` e `0%` escritos no JSX, com um `+0%` em
      verde ao lado. Nunca mostrariam nada real, por mais leads que entrassem. */
   const { data: metricas } = useQuery({
     queryKey: ['form-metrics', company?.id],
     queryFn: () => formMetrics.porEmpresa(company!.id),
     enabled: !!company?.id,
   });

   const { data: forms, isLoading, isError, error: queryError, refetch } = useQuery({
     queryKey: ['forms', company?.id],
     queryFn: async () => {
       if (!company?.id) throw new Error('Company ID is missing');
       logger.info('Fetching forms for company', { companyId: company.id });
       return formService.getForms(company.id);
     },
     enabled: !!company?.id,
     retry: 2,
     staleTime: 1000 * 30, // 30 seconds
   });

   // Debug logs for UI states
   React.useEffect(() => {
     logger.info('FormList state:', { 
       companyId: company?.id,
       hasForms: !!forms?.length, 
       isLoading, 
       isError,
       formCount: forms?.length || 0
     });
   }, [forms, isLoading, isError, company?.id]);

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

  if (isLoading && !forms) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="animate-pulse h-56 border-none shadow-sm rounded-2xl overflow-hidden bg-white">
            <div className="h-12 bg-muted/30" />
            <div className="p-6 space-y-3">
              <div className="h-5 bg-muted/30 w-1/2 rounded-lg" />
              <div className="h-3 bg-muted/30 w-1/3 rounded-lg" />
              <div className="h-16 bg-muted/20 w-full rounded-xl mt-4" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

    if (isError) {
     return (
       <Card className="border-destructive/20 bg-destructive/5 flex flex-col items-center justify-center p-12 text-center space-y-4">
         <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
           <AlertCircle className="h-8 w-8 text-destructive" />
         </div>
         <div className="space-y-1">
          <h3 className="font-bold text-lg text-destructive">
            {!company?.id ? 'Workspace não identificado' : 'Falha ao carregar formulários'}
          </h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            {!company?.id 
              ? 'Sua sessão expirou ou sua empresa ainda não foi validada. Por favor, recarregue a página.' 
              : (queryError as any)?.message || 'Ocorreu um erro ao conectar ao banco de dados.'}
          </p>
         </div>
         <Button onClick={() => refetch()} variant="outline" className="gap-2">
           <RefreshCcw className="h-4 w-4" />
           Try Again
         </Button>
       </Card>
     );
   }

    if (!isLoading && !company?.id) {
      return (
        <Card className="border-primary/20 bg-primary/5 flex flex-col items-center justify-center p-12 text-center space-y-4">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <RefreshCcw className="h-8 w-8 text-primary animate-spin" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-lg">Validando acesso ao Workspace</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              Aguardando confirmação de permissões para carregar seus formulários...
            </p>
          </div>
        </Card>
      );
    }

   if (!isLoading && (!forms || forms.length === 0)) {
     return (
       <Card className="border-dashed flex flex-col items-center justify-center p-12 text-center space-y-4">
        <div className="w-16 h-16 bg-primary/5 rounded-full flex items-center justify-center">
          <FileText className="h-8 w-8 text-primary/40" />
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-lg">Nenhum formulário criado ainda</h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            Crie seu primeiro formulário de alta conversão para começar a capturar leads hoje mesmo.
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {forms?.map((form) => (
        /* O cartão não tinha handler nenhum: clicar nele — uma ou duas vezes —
           não fazia nada, e editar só era possível pelo menu de três pontinhos,
           que é onde ninguém procura primeiro. Os botões de dentro param a
           propagação para não abrirem o editor junto. */
        <Card
          key={form.id}
          role="button"
          tabIndex={0}
          aria-label={`Editar o formulário ${form.name}`}
          onClick={() => onEdit(form.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(form.id); }
          }}
          className="group relative cursor-pointer transition-all duration-500 border-none shadow-[0_4px_15px_-3px_rgba(0,0,0,0.08)] hover:shadow-[0_15px_30px_-10px_rgba(0,0,0,0.12)] hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary bg-white overflow-hidden flex flex-col rounded-[20px]">
          {/* Blue Top Banner - Adjusted Height */}
          <div className="h-10 w-full bg-gradient-to-r from-primary to-blue-600 relative overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.1)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.1)_75%,transparent_75%,transparent)] bg-[length:20px_20px] opacity-10" />
            <div className="absolute top-2 right-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} className="h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur-sm transition-all">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl p-1 shadow-xl border-slate-200/60">
                  <DropdownMenuItem onClick={() => onEdit(form.id)} className="gap-2.5 rounded-lg py-2.5 cursor-pointer">
                    <Edit3 className="h-3.5 w-3.5 text-slate-500" /> 
                    <span className="font-semibold text-xs">Editar</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2.5 rounded-lg py-2.5 cursor-pointer">
                    <Copy className="h-3.5 w-3.5 text-slate-500" /> 
                    <span className="font-semibold text-xs">Duplicar</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2.5 rounded-lg py-2.5 cursor-pointer">
                    <BarChart3 className="h-3.5 w-3.5 text-slate-500" /> 
                    <span className="font-semibold text-xs">Relatórios</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1" />
                  <DropdownMenuItem className="gap-2.5 rounded-lg py-2.5 text-destructive focus:text-destructive focus:bg-destructive/5 cursor-pointer" onClick={() => deleteMutation.mutate(form.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> 
                    <span className="font-semibold text-xs">Excluir</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <CardHeader className="p-5 pt-4 flex flex-col space-y-3">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Badge variant={form.status === 'published' ? 'default' : 'secondary'} className="text-[9px] uppercase font-black tracking-widest px-2 py-0 h-4 rounded-full bg-primary/10 text-primary border-none shadow-none">
                  {form.status === 'published' ? 'Ativo' : 'Rascunho'}
                </Badge>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate max-w-[100px]">
                  {form.slug}
                </span>
              </div>
              <CardTitle className="text-lg font-black text-slate-900 truncate leading-tight tracking-tight group-hover:text-primary transition-colors">
                {form.name}
              </CardTitle>
            </div>
          </CardHeader>
          
          <CardContent className="px-5 pb-5 pt-0 mt-auto">
            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-100/50 mb-5 transition-all group-hover:bg-slate-50">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black">Leads</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black text-slate-900 leading-none tracking-tighter tabular-nums">
                    {(metricas?.[form.id]?.enviados ?? 0).toLocaleString('pt-BR')}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-0.5 border-l border-slate-200/60 pl-3">
                <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black">Conclusão</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-black text-slate-900 leading-none tracking-tighter tabular-nums">
                    {metricas?.[form.id]?.taxa_de_conclusao ?? 0}%
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1 text-[10px] uppercase font-black tracking-widest h-10 gap-2 rounded-lg border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm" 
                onClick={(e) => { e.stopPropagation(); window.open(`/f/${form.slug}`, '_blank'); }}
              >
                <Eye className="h-3.5 w-3.5" /> Ver
              </Button>
              <EmbedDialog form={form} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}