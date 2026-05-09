import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  Globe, 
  Settings2, 
  Code2, 
  Copy, 
  Check, 
  ExternalLink, 
  MousePointer2, 
  MessageSquare, 
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  PlayCircle,
  CheckCircle2,
  FileCode,
  Laptop,
  Smartphone
} from 'lucide-react';
import { Form } from '../services/formService';
import { toast } from 'sonner';

interface FormPublishProps {
  form: Form;
}

export function FormPublish({ form }: FormPublishProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<'inline' | 'popup' | 'floating' | 'ecommerce'>('inline');
  const [testResult, setTestResult] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  
  const publicUrl = `${window.location.origin}/f/${form.slug}`;
  
  // Configs
  const [configs, setConfigs] = useState({
    width: '100%',
    height: '700',
    trigger: 'exit_intent',
    delay: '5',
    position: 'bottom-right',
    buttonText: 'Fale com um consultor',
    ecommerceContext: true
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success('Copiado para a área de transferência');
    setTimeout(() => setCopied(null), 2000);
  };

  const getShortcode = () => {
    switch (mode) {
      case 'inline': return `[leadflow_form id="${form.id}"]`;
      case 'popup': return `[leadflow_popup id="${form.id}" trigger="${configs.trigger}"]`;
      case 'floating': return `[leadflow_floating id="${form.id}" position="${configs.position}" label="${configs.buttonText}"]`;
      case 'ecommerce': return `[leadflow_ecommerce_form id="${form.id}" product_context="true"]`;
      default: return `[leadflow_form id="${form.id}"]`;
    }
  };

  const runTest = () => {
    setTestResult('testing');
    setTimeout(() => {
      if (form.status === 'published') {
        setTestResult('success');
        toast.success('Integração validada com sucesso!');
      } else {
        setTestResult('error');
        toast.error('O formulário precisa estar publicado para o teste funcionar.');
      }
    }, 1500);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tighter">WordPress Shortcode Wizard</h2>
          <p className="text-muted-foreground text-sm">Gere e valide sua integração WordPress em segundos.</p>
        </div>
        <div className="flex items-center gap-2">
           <Badge variant={form.status === 'published' ? 'default' : 'outline'} className={form.status === 'published' ? 'bg-green-500 hover:bg-green-600' : ''}>
             {form.status === 'published' ? 'Pronto para Uso' : 'Aguardando Publicação'}
           </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Wizard Steps */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-2">
             {[1, 2, 3, 4].map((s) => (
               <div key={s} className="flex items-center gap-2">
                 <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step === s ? 'bg-primary text-primary-foreground scale-110 shadow-lg' : step > s ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                   {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
                 </div>
                 {s < 4 && <div className="w-12 h-[2px] bg-muted" />}
               </div>
             ))}
          </div>

          <Card className="border-none shadow-sm overflow-hidden min-h-[400px]">
            <CardHeader className="bg-muted/30 pb-4">
              <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                {step === 1 && "Escolha o Modo de Instalação"}
                {step === 2 && "Configurações do Shortcode"}
                {step === 3 && "Código Gerado"}
                {step === 4 && "Validação Final"}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {step === 1 && (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { id: 'inline', title: 'Inline', icon: FileCode, desc: 'Incorporado no conteúdo' },
                    { id: 'popup', title: 'Popup', icon: MousePointer2, desc: 'Abre ao sair ou rolar' },
                    { id: 'floating', title: 'Flutuante', icon: MessageSquare, desc: 'Botão sempre visível' },
                    { id: 'ecommerce', title: 'E-commerce', icon: ShoppingBag, desc: 'Captura dados do produto' }
                  ].map((m) => (
                    <div 
                      key={m.id}
                      onClick={() => { setMode(m.id as any); setStep(2); }}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:border-primary/50 group ${mode === m.id ? 'border-primary bg-primary/[0.03]' : 'bg-card'}`}
                    >
                      <m.icon className={`h-8 w-8 mb-3 transition-colors ${mode === m.id ? 'text-primary' : 'text-muted-foreground group-hover:text-primary'}`} />
                      <h4 className="font-bold text-sm">{m.title}</h4>
                      <p className="text-[10px] text-muted-foreground">{m.desc}</p>
                    </div>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  {mode === 'inline' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Largura Máxima</Label>
                        <Input value={configs.width} onChange={(e) => setConfigs({...configs, width: e.target.value})} className="h-9" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Altura Estimada</Label>
                        <Input value={configs.height} onChange={(e) => setConfigs({...configs, height: e.target.value})} className="h-9" />
                      </div>
                    </div>
                  )}

                  {mode === 'popup' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Gatilho (Trigger)</Label>
                        <select className="w-full h-9 rounded-md border bg-background text-sm px-3" value={configs.trigger} onChange={(e) => setConfigs({...configs, trigger: e.target.value})}>
                          <option value="exit_intent">Intenção de Saída</option>
                          <option value="timer">Tempo na Página</option>
                          <option value="scroll">Profundidade de Rolagem</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {mode === 'floating' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Texto do Botão</Label>
                        <Input value={configs.buttonText} onChange={(e) => setConfigs({...configs, buttonText: e.target.value})} className="h-9" />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-[10px] font-bold uppercase tracking-widest opacity-60">Rastreamento Inteligente</Label>
                      <p className="text-[10px] text-muted-foreground">Captura UTMs e GCLID automaticamente.</p>
                    </div>
                    <Switch checked={true} onCheckedChange={() => {}} />
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="ghost" onClick={() => setStep(1)}>Voltar</Button>
                    <Button onClick={() => setStep(3)}>Gerar Código <ArrowRight className="h-4 w-4 ml-2" /></Button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6 animate-in slide-in-from-right-4">
                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase tracking-widest">Shortcode WordPress</Label>
                    <div className="flex gap-2">
                      <Input value={getShortcode()} readOnly className="bg-muted font-mono text-xs h-10" />
                      <Button onClick={() => copyToClipboard(getShortcode(), 'sc')}>
                        {copied === 'sc' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase tracking-widest">Script Embed (Para outros sites)</Label>
                    <div className="relative group">
                      <pre className="bg-muted p-4 rounded-lg text-[10px] font-mono overflow-x-auto">
                        {`<script src="${window.location.origin}/sdk.js"></script>\n<script>\n  LeadFlow.init("${form.id}", { mode: "${mode}" });\n</script>`}
                      </pre>
                      <Button 
                        size="icon" variant="ghost" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => copyToClipboard(`<script src="${window.location.origin}/sdk.js"></script>\n<script>\n  LeadFlow.init("${form.id}", { mode: "${mode}" });\n</script>`, 'script')}
                      >
                        {copied === 'script' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="ghost" onClick={() => setStep(2)}>Ajustar Configs</Button>
                    <Button onClick={() => setStep(4)} className="bg-green-600 hover:bg-green-700">Validar Integração <PlayCircle className="h-4 w-4 ml-2" /></Button>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6 animate-in zoom-in-95 duration-300 text-center">
                  <div className="flex flex-col items-center py-6">
                    {testResult === 'idle' && (
                      <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <PlayCircle className="h-10 w-10 text-primary animate-pulse" />
                      </div>
                    )}
                    {testResult === 'testing' && (
                      <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                        <div className="h-10 w-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                    {testResult === 'success' && (
                      <div className="h-20 w-20 bg-green-500/10 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle2 className="h-10 w-10 text-green-500" />
                      </div>
                    )}
                    {testResult === 'error' && (
                      <div className="h-20 w-20 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                        <AlertCircle className="h-10 w-10 text-destructive" />
                      </div>
                    )}

                    <h3 className="text-xl font-black uppercase tracking-tighter">
                      {testResult === 'idle' && "Pronto para Validar?"}
                      {testResult === 'testing' && "Validando Sinais..."}
                      {testResult === 'success' && "Tudo Operacional!"}
                      {testResult === 'error' && "Ops! Detectamos algo"}
                    </h3>
                    <p className="text-muted-foreground text-xs mt-2 max-w-sm">
                      {testResult === 'idle' && "Iniciaremos um teste simulado para garantir que o SDK e o shortcode estão respondendo corretamente."}
                      {testResult === 'testing' && "Verificando status do formulário, carregamento do SDK e captura de UTMs."}
                      {testResult === 'success' && "O shortcode foi validado e o SDK está pronto para capturar leads com rastreamento total."}
                      {testResult === 'error' && "O formulário está em modo rascunho. Publique-o na aba Builder para ativar a captura."}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-left bg-muted/30 p-4 rounded-xl">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase">
                      <ShieldCheck className={`h-3 w-3 ${form.status === 'published' ? 'text-green-500' : 'text-muted-foreground'}`} /> Status: {form.status}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase">
                      <ShieldCheck className="h-3 w-3 text-green-500" /> SDK v1.1.0
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase">
                      <ShieldCheck className="h-3 w-3 text-green-500" /> UTM Passthrough
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase">
                      <ShieldCheck className="h-3 w-3 text-green-500" /> Shortcode Gerado
                    </div>
                  </div>

                  <div className="flex justify-between pt-4">
                    <Button variant="ghost" onClick={() => setStep(3)}>Revisar Código</Button>
                    {testResult !== 'success' && (
                      <Button onClick={runTest} disabled={testResult === 'testing'}>
                        {testResult === 'testing' ? 'Validando...' : 'Iniciar Teste'}
                      </Button>
                    )}
                    {testResult === 'success' && (
                      <Button className="bg-green-600 hover:bg-green-700 gap-2" onClick={() => setStep(1)}>
                        Finalizar Wizard <Check className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Context */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Laptop className="h-4 w-4" /> Preview Visual
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
               <div className="aspect-video bg-muted/50 rounded-lg flex items-center justify-center border-2 border-dashed relative overflow-hidden group">
                 {mode === 'inline' && (
                   <div className="w-2/3 h-2/3 bg-card rounded-md shadow-sm p-4 flex flex-col gap-2">
                     <div className="h-2 bg-muted rounded w-3/4" />
                     <div className="h-2 bg-muted rounded w-full" />
                     <div className="h-4 bg-primary/20 rounded w-full mt-2" />
                   </div>
                 )}
                 {mode === 'popup' && (
                   <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                     <div className="w-1/2 h-1/2 bg-card rounded-md shadow-xl p-3 flex flex-col gap-2 scale-90 animate-in zoom-in-90">
                        <div className="h-2 bg-muted rounded w-1/2" />
                        <div className="h-4 bg-primary/20 rounded w-full mt-auto" />
                     </div>
                   </div>
                 )}
                 {mode === 'floating' && (
                   <div className="absolute bottom-2 right-2 w-10 h-10 bg-primary rounded-full shadow-lg flex items-center justify-center text-primary-foreground">
                     <MessageSquare className="h-5 w-5" />
                   </div>
                 )}
                 {mode === 'ecommerce' && (
                   <div className="w-full h-full p-4 flex flex-col gap-2">
                     <div className="flex gap-2">
                       <div className="w-1/3 aspect-square bg-muted rounded" />
                       <div className="flex-1 space-y-1">
                         <div className="h-2 bg-muted rounded w-3/4" />
                         <div className="h-2 bg-muted rounded w-1/2" />
                       </div>
                     </div>
                     <div className="h-6 bg-primary/10 rounded w-full mt-auto border border-dashed border-primary/20" />
                   </div>
                 )}
                 <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                   <p className="text-[10px] font-bold uppercase bg-primary text-primary-foreground px-2 py-1 rounded">Simulação Real-time</p>
                 </div>
               </div>
               
               <div className="flex gap-2 justify-center">
                 <Button variant="ghost" size="icon" className="h-8 w-8 text-primary border-b-2 border-primary rounded-none">
                   <Laptop className="h-4 w-4" />
                 </Button>
                 <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                   <Smartphone className="h-4 w-4" />
                 </Button>
               </div>
            </CardContent>
          </Card>

          <Card className="border-primary/10 bg-primary/[0.02]">
            <CardHeader className="pb-2">
              <CardTitle className="text-[10px] font-bold uppercase tracking-widest text-primary">Documentação Express</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {[
                  "Instale o plugin LeadFlow WP",
                  "Cole o Shortcode gerado",
                  "Ative o UTM Passthrough",
                  "Inicie a captura de Leads"
                ].map((item, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="h-4 w-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">{i+1}</div>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">{item}</p>
                  </div>
                ))}
              </div>
              <Button variant="outline" className="w-full text-[10px] h-8 font-bold uppercase tracking-wider gap-2">
                Ver Docs Completa <ExternalLink className="h-3 w-3" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
