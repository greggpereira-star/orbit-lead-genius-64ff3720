function EmbedDialog({ form }: { form: Form }) {
  const [copied, setCopied] = React.useState(false);
  const publicUrl = `${window.location.origin}/f/${form.slug}`;
  
   const iframeCode = `<iframe src="${window.location.origin}/embed-form/${form.id}" width="100%" height="700" style="border:0; border-radius:12px;" loading="lazy"></iframe>`;
   const scriptCode = `<div id="leadflow-form-${form.id}"></div>
 <script src="${window.location.origin}/sdk.js"></script>
 <script>
   window.addEventListener('load', function() {
     LeadFlow.init({
       formId: "${form.id}",
       target: "#leadflow-form-${form.id}",
       mode: "inline"
     });
   });
 </script>`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Code copied to clipboard');
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1 text-[10px] uppercase font-bold tracking-wider h-8 gap-1.5">
          <Code2 className="h-3 w-3" /> Embed
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Embed Form: {form.name}</DialogTitle>
          <DialogDescription>
            Choose how you want to integrate this form into your website.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="iframe" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="iframe">iFrame</TabsTrigger>
            <TabsTrigger value="link">Public Link</TabsTrigger>
            <TabsTrigger value="wordpress">WordPress</TabsTrigger>
          </TabsList>
          
          <TabsContent value="iframe" className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">The easiest way to embed. Works on any site including WordPress, Elementor, and Webflow.</p>
            <div className="relative">
              <pre className="bg-muted p-4 rounded-lg text-[10px] font-mono overflow-x-auto">
                {iframeCode}
              </pre>
              <Button 
                size="icon" 
                variant="ghost" 
                className="absolute top-2 right-2"
                onClick={() => copyToClipboard(iframeCode)}
              >
                {copied ? <ClipboardCheck className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="link" className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">Share this link directly or use it in buttons and social media.</p>
            <div className="flex gap-2">
              <Input value={publicUrl} readOnly className="text-xs" />
              <Button onClick={() => copyToClipboard(publicUrl)}>Copy</Button>
            </div>
            <Button variant="outline" className="w-full gap-2" onClick={() => window.open(publicUrl, '_blank')}>
              <ExternalLink className="h-4 w-4" /> View Live Form
            </Button>
          </TabsContent>

           <TabsContent value="wordpress" className="space-y-4 pt-4">
             <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 space-y-4">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                   <CheckCircle2 className="h-5 w-5" />
                 </div>
                 <div>
                   <h4 className="text-sm font-black uppercase tracking-tight">WordPress Integration</h4>
                   <p className="text-[11px] text-muted-foreground">Siga os passos abaixo para inserir no seu site.</p>
                 </div>
               </div>

               <div className="space-y-4">
                 <div className="space-y-2">
                   <Label className="text-[10px] font-bold uppercase tracking-widest text-primary">Opção 1: Script (Recomendado)</Label>
                   <p className="text-[11px] text-muted-foreground">Melhor para rastreamento de UTMs e performance.</p>
                   <div className="relative">
                     <pre className="bg-background p-3 rounded-lg text-[10px] font-mono border overflow-x-auto">
                       {scriptCode}
                     </pre>
                     <Button 
                       size="icon" 
                       variant="ghost" 
                       className="absolute top-1 right-1 h-7 w-7"
                       onClick={() => copyToClipboard(scriptCode)}
                     >
                       {copied ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                     </Button>
                   </div>
                 </div>

                 <div className="space-y-2 pt-2 border-t border-primary/10">
                   <Label className="text-[10px] font-bold uppercase tracking-widest text-primary">Opção 2: Iframe</Label>
                   <p className="text-[11px] text-muted-foreground">Use se o seu tema bloquear scripts externos.</p>
                   <div className="relative">
                     <pre className="bg-background p-3 rounded-lg text-[10px] font-mono border overflow-x-auto">
                       {iframeCode}
                     </pre>
                     <Button 
                       size="icon" 
                       variant="ghost" 
                       className="absolute top-1 right-1 h-7 w-7"
                       onClick={() => copyToClipboard(iframeCode)}
                     >
                       {copied ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                     </Button>
                   </div>
                 </div>
               </div>
             </div>

             <div className="p-4 bg-slate-50 border rounded-xl space-y-2">
               <h5 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                 <AlertCircle className="h-3 w-3 text-amber-500" />
                 Como inserir no WordPress:
               </h5>
               <ol className="text-[11px] text-muted-foreground list-decimal pl-4 space-y-1">
                 <li>No editor do WordPress (Gutenberg), adicione um bloco chamado <strong>"HTML Personalizado"</strong>.</li>
                 <li>Cole o código da <strong>Opção 1</strong> acima dentro do bloco.</li>
                 <li>Se estiver usando <strong>Elementor</strong>, use o widget "HTML".</li>
                 <li>Salve a página e visualize o resultado.</li>
               </ol>
             </div>
           </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
 import React from 'react';
 import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
 import { formService, Form } from '../services/formService';
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse h-64 border-none shadow-sm rounded-2xl overflow-hidden bg-white">
            <div className="h-16 bg-muted/30" />
            <div className="p-8 space-y-4">
              <div className="h-6 bg-muted/30 w-1/2 rounded-lg" />
              <div className="h-4 bg-muted/30 w-1/3 rounded-lg" />
              <div className="h-20 bg-muted/20 w-full rounded-xl mt-6" />
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {forms?.map((form) => (
        <Card key={form.id} className="group relative transition-all duration-500 border-none shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)] hover:shadow-[0_20px_40px_-12px_rgba(0,0,0,0.15)] hover:-translate-y-1 bg-white overflow-hidden flex flex-col rounded-[24px]">
          {/* Blue Top Banner */}
          <div className="h-16 w-full bg-gradient-to-r from-primary to-blue-600 relative overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.1)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.1)_50%,rgba(255,255,255,0.1)_75%,transparent_75%,transparent)] bg-[length:24px_24px] opacity-10" />
            <div className="absolute top-4 right-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white border-none backdrop-blur-sm transition-all">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-2xl p-1.5 shadow-2xl border-slate-200/60">
                  <DropdownMenuItem onClick={() => onEdit(form.id)} className="gap-3 rounded-xl py-3 cursor-pointer">
                    <Edit3 className="h-4 w-4 text-slate-500" /> 
                    <span className="font-semibold text-sm">Editar Detalhes</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-3 rounded-xl py-3 cursor-pointer">
                    <Copy className="h-4 w-4 text-slate-500" /> 
                    <span className="font-semibold text-sm">Duplicar</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-3 rounded-xl py-3 cursor-pointer">
                    <BarChart3 className="h-4 w-4 text-slate-500" /> 
                    <span className="font-semibold text-sm">Relatórios</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-1.5" />
                  <DropdownMenuItem className="gap-3 rounded-xl py-3 text-destructive focus:text-destructive focus:bg-destructive/5 cursor-pointer" onClick={() => deleteMutation.mutate(form.id)}>
                    <Trash2 className="h-4 w-4" /> 
                    <span className="font-semibold text-sm">Excluir Formulário</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <CardHeader className="p-8 pt-6 flex flex-col space-y-4">
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={form.status === 'published' ? 'default' : 'secondary'} className="text-[10px] uppercase font-black tracking-widest px-2.5 py-0.5 h-5 rounded-full bg-primary/10 text-primary border-none shadow-none">
                  {form.status === 'published' ? 'Ativo' : 'Rascunho'}
                </Badge>
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                  ID: {form.slug}
                </span>
              </div>
              <CardTitle className="text-2xl font-black text-slate-900 truncate leading-tight tracking-tight group-hover:text-primary transition-colors">
                {form.name}
              </CardTitle>
            </div>
          </CardHeader>
          
          <CardContent className="px-8 pb-8 pt-0 mt-auto">
            <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50/80 rounded-2xl border border-slate-100/50 mb-8 transition-all group-hover:bg-slate-50">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Total de Leads</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-900 leading-none tracking-tighter">0</span>
                  <span className="text-[10px] text-green-500 font-bold">+0%</span>
                </div>
              </div>
              <div className="flex flex-col gap-1 border-l border-slate-200/60 pl-4">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-black">Conversão</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-900 leading-none tracking-tighter">0%</span>
                  <span className="text-[10px] text-slate-400 font-bold">avg.</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                size="lg" 
                className="flex-1 text-[11px] uppercase font-black tracking-widest h-12 gap-2.5 rounded-xl border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm active:scale-[0.98]" 
                onClick={() => window.open(`/f/${form.slug}`, '_blank')}
              >
                <Eye className="h-4 w-4" /> Visualizar
              </Button>
              <EmbedDialog form={form} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}