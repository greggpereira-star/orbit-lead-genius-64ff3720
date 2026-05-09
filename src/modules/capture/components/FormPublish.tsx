 import React, { useState } from 'react';
 import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
 import { 
   Link as LinkIcon, 
   Code2, 
   ExternalLink, 
   Copy, 
   Check, 
   Globe, 
   MousePointer2, 
   MessageSquare, 
   Layers, 
   QrCode,
   ShoppingBag,
   Wrench,
   Smartphone
 } from 'lucide-react';
 import { Form } from '../services/formService';
 import { toast } from 'sonner';
 
 interface FormPublishProps {
   form: Form;
 }
 
 export function FormPublish({ form }: FormPublishProps) {
   const [copied, setCopied] = useState<string | null>(null);
   const [sdkCode, setSdkCode] = useState('inline');
   const publicUrl = `${window.location.origin}/f/${form.slug}`;
   const sdkUrl = `${window.location.origin}/sdk.js`;
   const publicUrl = `${window.location.origin}/f/${form.slug}`;
 
   const copyToClipboard = (text: string, id: string) => {
     navigator.clipboard.writeText(text);
     setCopied(id);
     toast.success('Copiado para a área de transferência');
     setTimeout(() => setCopied(null), 2000);
   };
 
   const publishMethods = [
     {
       id: 'link',
       title: 'Link Público',
       description: 'Compartilhe diretamente ou use em redes sociais.',
       icon: LinkIcon,
       content: (
         <div className="space-y-4 pt-4">
           <div className="flex gap-2">
             <Input value={publicUrl} readOnly className="bg-muted" />
             <Button onClick={() => copyToClipboard(publicUrl, 'link')}>
               {copied === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
             </Button>
           </div>
           <div className="flex gap-2">
             <Button variant="outline" className="flex-1 gap-2" onClick={() => window.open(publicUrl, '_blank')}>
               <ExternalLink className="h-4 w-4" /> Abrir Preview
             </Button>
             <Button variant="outline" className="gap-2">
               <QrCode className="h-4 w-4" /> QR Code
             </Button>
           </div>
         </div>
       )
     },
     {
       id: 'embed',
       title: 'Incorporar no Site',
       description: 'iFrame padrão para qualquer site ou landing page.',
       icon: Code2,
       content: (
         <div className="space-y-4 pt-4">
           <div className="relative group">
             <pre className="bg-muted p-4 rounded-lg text-[11px] font-mono overflow-x-auto border">
               {`<iframe src="${publicUrl}" width="100%" height="700" frameborder="0" style="border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></iframe>`}
             </pre>
             <Button 
               size="icon" 
               variant="ghost" 
               className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
               onClick={() => copyToClipboard(`<iframe src="${publicUrl}" width="100%" height="700" frameborder="0" style="border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);"></iframe>`, 'iframe')}
             >
               {copied === 'iframe' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
             </Button>
           </div>
           <p className="text-[10px] text-muted-foreground italic">Recomendado para: Elementor, Webflow, Wix e HTML Puro.</p>
         </div>
       )
     },
     {
       id: 'wordpress',
       title: 'WordPress',
       description: 'Shortcode universal para o seu blog ou site WP.',
       icon: Globe,
       content: (
         <div className="space-y-4 pt-4">
           <div className="flex gap-2">
             <Input value={`[leadflow_form id="${form.id}"]`} readOnly className="bg-muted font-mono text-xs" />
             <Button onClick={() => copyToClipboard(`[leadflow_form id="${form.id}"]`, 'wp')}>
               {copied === 'wp' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
             </Button>
           </div>
           <div className="p-3 bg-primary/5 border border-primary/10 rounded-lg">
             <h4 className="text-[10px] font-bold uppercase tracking-wider mb-1">Dica Pro</h4>
             <p className="text-[10px] text-muted-foreground">Instale o plugin LeadFlow WP para ativar UTM passthrough automático e popups globais.</p>
           </div>
         </div>
       )
     },
     {
       id: 'popup',
       title: 'Popup (Exit Intent)',
       description: 'Capture leads quando eles tentarem sair do site.',
       icon: MousePointer2,
       content: (
         <div className="space-y-4 pt-4">
           <div className="relative group">
             <pre className="bg-muted p-4 rounded-lg text-[10px] font-mono overflow-x-auto border">
               {`<script src="${window.location.origin}/sdk.js"></script>\n<script>\n  LeadFlow.popup("${form.id}", { trigger: "exit" });\n</script>`}
             </pre>
             <Button 
               size="icon" 
               variant="ghost" 
               className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
               onClick={() => copyToClipboard(`<script src="${window.location.origin}/sdk.js"></script>\n<script>\n  LeadFlow.popup("${form.id}", { trigger: "exit" });\n</script>`, 'popup')}
             >
               {copied === 'popup' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
             </Button>
           </div>
         </div>
       )
     },
     {
       id: 'floating',
       title: 'Botão Flutuante',
       description: 'Widget de contato sempre visível no canto da tela.',
       icon: MessageSquare,
       content: (
         <div className="space-y-4 pt-4">
           <div className="relative group">
             <pre className="bg-muted p-4 rounded-lg text-[10px] font-mono overflow-x-auto border">
               {`<script src="${window.location.origin}/sdk.js"></script>\n<script>\n  LeadFlow.floating("${form.id}", { position: "bottom-right" });\n</script>`}
             </pre>
             <Button 
               size="icon" 
               variant="ghost" 
               className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
               onClick={() => copyToClipboard(`<script src="${window.location.origin}/sdk.js"></script>\n<script>\n  LeadFlow.floating("${form.id}", { position: "bottom-right" });\n</script>`, 'floating')}
             >
               {copied === 'floating' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
             </Button>
           </div>
         </div>
       )
     },
     {
       id: 'ecommerce',
       title: 'E-commerce (Woo/Shopify)',
       description: 'Capture leads integrados com produtos e carrinho.',
       icon: ShoppingBag,
       content: (
         <div className="space-y-4 pt-4">
           <div className="relative group">
             <pre className="bg-muted p-3 rounded-lg text-[9px] font-mono overflow-x-auto border">
               {`<script>\n  LeadFlow.trackProduct({\n    id: "PROD-123",\n    name: "Produto Exemplo",\n    price: 299.90\n  });\n</script>`}
             </pre>
             <Button 
               size="icon" 
               variant="ghost" 
               className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
               onClick={() => copyToClipboard(`<script>\n  LeadFlow.trackProduct({\n    id: "PROD-123",\n    name: "Produto Exemplo",\n    price: 299.90\n  });\n</script>`, 'eco')}
             >
               {copied === 'eco' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
             </Button>
           </div>
           <p className="text-[9px] text-muted-foreground">O formulário vinculará o lead ao produto visualizado automaticamente.</p>
         </div>
       )
     }
   ];
 
   return (
     <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
       <div className="flex items-center justify-between">
         <div>
           <h2 className="text-2xl font-bold tracking-tight">Publicação Enterprise</h2>
           <p className="text-muted-foreground text-sm">Distribua seu formulário em qualquer plataforma com rastreamento universal.</p>
         </div>
         <div className="flex items-center gap-2">
           <div className={`h-2.5 w-2.5 rounded-full ${form.status === 'published' ? 'bg-green-500' : 'bg-yellow-500'} animate-pulse`} />
           <span className="text-xs font-bold uppercase tracking-widest">
             {form.status === 'published' ? 'Publicado' : 'Rascunho'}
           </span>
         </div>
       </div>
 
       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
         {publishMethods.map((method) => (
           <Card key={method.id} className="border-none shadow-sm overflow-hidden flex flex-col group hover:ring-2 hover:ring-primary/20 transition-all">
             <div className="h-1.5 bg-primary/10 group-hover:bg-primary transition-colors" />
             <CardHeader className="pb-2">
               <div className="flex items-center justify-between">
                 <div className="p-2 rounded-lg bg-primary/5 text-primary">
                   <method.icon className="h-5 w-5" />
                 </div>
                 <Badge variant="secondary" className="text-[9px] uppercase font-bold tracking-widest">Ativo</Badge>
               </div>
               <CardTitle className="text-base mt-4">{method.title}</CardTitle>
               <CardDescription className="text-xs">{method.description}</CardDescription>
             </CardHeader>
             <CardContent className="flex-1">
               {method.content}
             </CardContent>
           </Card>
         ))}
       </div>
 
       <Card className="border-primary/10 bg-primary/[0.02]">
         <CardHeader className="pb-3">
           <div className="flex items-center gap-2">
             <Wrench className="h-4 w-4 text-primary" />
             <CardTitle className="text-sm font-bold uppercase tracking-widest">Configurações de SEO & Tracking</CardTitle>
           </div>
         </CardHeader>
         <CardContent>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-4">
               <div className="space-y-1.5">
                 <Label className="text-[10px] uppercase font-bold opacity-60">Meta Title</Label>
                 <Input placeholder="Título para Google e Redes Sociais" className="h-9" />
               </div>
               <div className="space-y-1.5">
                 <Label className="text-[10px] uppercase font-bold opacity-60">Meta Description</Label>
                 <Input placeholder="Breve descrição do formulário..." className="h-9" />
               </div>
             </div>
             <div className="space-y-4">
               <div className="space-y-1.5">
                 <Label className="text-[10px] uppercase font-bold opacity-60">Facebook Pixel ID</Label>
                 <Input placeholder="Ex: 1234567890" className="h-9" />
               </div>
               <div className="space-y-1.5">
                 <Label className="text-[10px] uppercase font-bold opacity-60">Google Analytics (G-ID)</Label>
                 <Input placeholder="Ex: G-XXXXXXXXXX" className="h-9" />
               </div>
             </div>
           </div>
         </CardContent>
       </Card>
     </div>
   );
 }
 
 function Badge({ children, variant = 'default', className = '' }: { children: React.ReactNode, variant?: 'default' | 'secondary', className?: string }) {
   const variants = {
     default: 'bg-primary text-primary-foreground',
     secondary: 'bg-secondary text-secondary-foreground'
   };
   return (
     <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}>
       {children}
     </span>
   );
 }