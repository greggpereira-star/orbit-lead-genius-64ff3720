function EmbedDialog({ form }: { form: Form }) {
  const [copied, setCopied] = React.useState(false);
  const publicUrl = `${window.location.origin}/f/${form.slug}`;
  
  const iframeCode = `<iframe src="${publicUrl}" width="100%" height="700" frameborder="0"></iframe>`;
  const scriptCode = `<script src="${window.location.origin}/widget.js"></script>
<script>
  LeadFlow.initForm({
    formId: "${form.id}",
    slug: "${form.slug}"
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
            <div className="p-4 bg-primary/5 border border-primary/10 rounded-lg space-y-2">
              <h4 className="text-sm font-bold uppercase tracking-wider">Shortcode (Coming Soon)</h4>
              <p className="text-xs text-muted-foreground">Once you install our WordPress plugin, you can use this shortcode:</p>
              <code className="bg-background px-2 py-1 rounded text-xs font-mono">[leadflow_form id="{form.id}"]</code>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-bold uppercase tracking-wider">Elementor / Gutenberg</h4>
              <p className="text-xs text-muted-foreground">Use the "HTML" widget and paste the iFrame code provided in the iFrame tab.</p>
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
   RefreshCcw
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
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { logger } from '@/core/observability/logger';

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

   if (isError || (!isLoading && !company?.id)) {
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

   if (!isLoading && (!forms || forms.length === 0)) {
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
       {forms?.map((form) => (
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
              <EmbedDialog form={form} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}