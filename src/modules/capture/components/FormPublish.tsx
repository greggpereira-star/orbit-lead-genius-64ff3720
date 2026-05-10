import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Laptop
} from 'lucide-react';
import { Form } from '../services/formService';
import { toast } from 'sonner';

interface FormPublishProps {
  form: Form;
}

export function FormPublish({ form }: FormPublishProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [mode, setMode] = useState<'inline' | 'popup' | 'floating' | 'iframe'>('inline');
  
  const publicUrl = `${window.location.origin}/f/${form.slug}`;
  
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success('Copiado para a área de transferência');
    setTimeout(() => setCopied(null), 2000);
  };

  const codes = {
    inline: `<div id="leadflow-form-${form.id}"></div>
<script src="${window.location.origin}/sdk.js"></script>
<script>
  LeadFlow.init({
    formId: "${form.id}",
    target: "#leadflow-form-${form.id}",
    mode: "inline"
  });
</script>`,
    popup: `<script src="${window.location.origin}/sdk.js"></script>
<script>
  LeadFlow.init({
    formId: "${form.id}",
    mode: "popup",
    trigger: "exit_intent"
  });
</script>`,
    floating: `<script src="${window.location.origin}/sdk.js"></script>
<script>
  LeadFlow.init({
    formId: "${form.id}",
    mode: "floating",
    position: "bottom-right",
    label: "Fale com um consultor"
  });
</script>`,
    iframe: `<iframe
  src="${window.location.origin}/embed/form/${form.id}"
  width="100%"
  height="700"
  style="border:0; border-radius:16px;"
  loading="lazy">
</iframe>`
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { id: 'inline', title: 'Inline Script', icon: FileCode },
          { id: 'iframe', title: 'Iframe Embed', icon: Code2 },
          { id: 'popup', title: 'Exit Popup', icon: MousePointer2 },
          { id: 'floating', title: 'Floating Button', icon: MessageSquare }
        ].map(m => (
          <Button 
            key={m.id}
            variant={mode === m.id ? 'default' : 'outline'}
            className="h-24 flex flex-col gap-2"
            onClick={() => setMode(m.id as any)}
          >
            <m.icon className="h-6 w-6" />
            <span className="text-xs font-bold">{m.title}</span>
          </Button>
        ))}
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Opções de Publicação</CardTitle>
              <CardDescription>Use o código abaixo para integrar o formulário ao seu site.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.open(publicUrl)} className="gap-2">
              <ExternalLink className="h-4 w-4" /> Link Público
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-widest">Código de Instalação</Label>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(codes[mode], 'code')} className="h-8 gap-2">
                {copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copiar Código
              </Button>
            </div>
            <pre className="bg-muted p-4 rounded-lg text-xs font-mono overflow-x-auto border">
              {codes[mode]}
            </pre>
          </div>

          <div className="bg-primary/5 p-4 rounded-xl border border-primary/20 space-y-3">
            <h4 className="text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Dicas de Implementação
            </h4>
            <ul className="text-xs space-y-2 text-muted-foreground list-disc pl-4">
              <li>O Script Embed captura UTMs automaticamente da página onde está instalado.</li>
              <li>Certifique-se de que o formulário está no status <strong>Publicado</strong>.</li>
              <li>Para WordPress, você pode usar um bloco "HTML Personalizado" para colar o código.</li>
            </ul>
          </div>

          <div className="pt-4 border-t">
            <Label className="text-xs font-bold uppercase tracking-widest mb-3 block">WordPress Shortcode</Label>
            <div className="flex gap-2">
              <Input value={`[leadflow_form id="${form.id}"]`} readOnly className="bg-muted font-mono text-xs" />
              <Button onClick={() => copyToClipboard(`[leadflow_form id="${form.id}"]`, 'shortcode')}>
                {copied === 'shortcode' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
