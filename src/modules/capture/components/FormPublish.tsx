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
  AlertCircle,
  PlayCircle,
  CheckCircle2,
  FileCode,
  Laptop,
  Download,
  ShieldCheck,
  Terminal
} from 'lucide-react';
import { Form } from '../services/formService';
import { toast } from 'sonner';

interface FormPublishProps {
  form: Form;
}

export function FormPublish({ form }: FormPublishProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [mode, setMode] = useState<
    'inline' | 'botao' | 'popup' | 'floating' | 'iframe' | 'email' | 'link'
  >('inline');
  /* Origem por canal: o mesmo formulário distribuído em dez lugares sem UTM
     chega todo como "(direct)/(none)" e não dá para saber o que trouxe lead. */
  const [canal, setCanal] = useState('email');

  const publicUrl = `${window.location.origin}/f/${form.slug}`;
  const urlComOrigem = `${publicUrl}?utm_source=${encodeURIComponent(canal)}&utm_medium=formulario&utm_campaign=${encodeURIComponent(form.slug)}`;
  
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success('Copiado para a área de transferência');
    setTimeout(() => setCopied(null), 2000);
  };

  const codes: Record<string, string> = {
    inline: `<!-- Cole onde o formulário deve aparecer -->\n<div data-lf-form="${form.id}"></div>\n<script src="${window.location.origin}/sdk.js" async></script>`,

    // O que faltava: ligar um botão QUE JÁ EXISTE na página ao formulário.
    // O botão flutuante cria um botão novo no canto; isto usa o da página.
    botao: `<!-- Em QUALQUER botão ou link já existente, basta o atributo -->\n<a href="#" data-lf-open="${form.id}">Fale com um consultor</a>\n\n<!-- Uma vez por página, de preferência antes do </body> -->\n<script src="${window.location.origin}/sdk.js" async></script>\n\n<!-- Em construtor que não deixa editar o HTML do botão, chame por código: -->\n<!-- onclick="LeadFlow.open('${form.id}')" -->`,

    popup: `<div data-lf-popup="${form.id}" data-lf-trigger="exit_intent"></div>\n<script src="${window.location.origin}/sdk.js" async></script>\n\n<!-- data-lf-trigger: exit_intent | delay | scroll -->\n<!-- com delay:  data-lf-trigger="delay" data-lf-delay="8" -->\n<!-- com rolagem: data-lf-trigger="scroll" data-lf-percent="0.6" -->`,

    floating: `<script src="${window.location.origin}/sdk.js"></script>\n<script>\n  window.addEventListener('load', function () {\n    LeadFlow.init({\n      formId: "${form.id}",\n      mode: "floating",\n      position: "bottom-right",\n      label: "Fale com um consultor"\n    });\n  });\n</script>`,

    iframe: `<iframe\n  src="${window.location.origin}/embed-form/${form.id}"\n  width="100%"\n  height="700"\n  style="border:0; border-radius:16px;"\n  loading="lazy">\n</iframe>`,

    // E-mail não executa JavaScript: só link. Tabela e estilo embutido porque
    // é o que o Outlook e o Gmail renderizam de forma previsível.
    email: `<table role="presentation" cellpadding="0" cellspacing="0" border="0">\n  <tr>\n    <td align="center" bgcolor="#2563eb" style="border-radius:8px;">\n      <a href="${publicUrl}?utm_source=email&utm_medium=formulario&utm_campaign=${form.slug}"\n         style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;\n                font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">\n        ${form.settings?.submit_label || 'Quero falar'}\n      </a>\n    </td>\n  </tr>\n</table>`,

    link: urlComOrigem,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        {[
          { id: 'inline', title: 'Dentro da página', icon: FileCode },
          { id: 'botao', title: 'Botão que você já tem', icon: MousePointer2 },
          { id: 'popup', title: 'Pop-up', icon: PlayCircle },
          { id: 'floating', title: 'Botão flutuante', icon: MessageSquare },
          { id: 'iframe', title: 'Iframe', icon: Code2 },
          { id: 'email', title: 'E-mail', icon: ShoppingBag },
          { id: 'link', title: 'Link com origem', icon: ExternalLink },
        ].map(m => (
          <Button 
            key={m.id}
            variant={mode === m.id ? 'default' : 'outline'}
            className="h-20 flex flex-col gap-1.5"
            onClick={() => setMode(m.id as any)}
          >
            <m.icon className="h-5 w-5" />
            <span className="text-[11px] font-semibold leading-tight text-center">{m.title}</span>
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
          {(mode === 'link' || mode === 'email') && (
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-widest">Origem do canal</Label>
              <div className="flex flex-wrap gap-2">
                {['email', 'whatsapp', 'instagram', 'bio', 'qrcode', 'sms', 'parceiro'].map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant={canal === c ? 'default' : 'outline'}
                    className="h-8 text-xs"
                    onClick={() => setCanal(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Entra como <code>utm_source</code> no lead. Sem isso o mesmo formulário
                distribuído em dez lugares chega todo como “(direct)/(none)” e não dá
                para saber o que trouxe o lead.
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold uppercase tracking-widest">
                {mode === 'link' ? 'Link para compartilhar' : 'Código de instalação'}
              </Label>
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
              <li>O formulário precisa estar <strong>Publicado</strong> — fora disso ele não abre para ninguém.</li>
              <li>As UTMs da página onde o formulário está são capturadas junto com o lead.</li>
              {mode === 'botao' && (
                <li>
                  O atributo <code>data-lf-open</code> vale para qualquer botão ou link,
                  inclusive os criados depois pelo construtor da página. O script só precisa
                  estar na página uma vez.
                </li>
              )}
              {mode === 'email' && (
                <li>
                  E-mail não executa JavaScript: o único caminho é o link. O botão abaixo usa
                  tabela e estilo embutido, que é o que o Outlook e o Gmail renderizam de
                  forma previsível.
                </li>
              )}
              {mode === 'popup' && (
                <li>
                  Três gatilhos: <code>exit_intent</code> (o cursor sai pelo topo),
                  <code>delay</code> (segundos) e <code>scroll</code> (proporção da página).
                </li>
              )}
              {(mode === 'inline' || mode === 'iframe') && (
                <li>Pode haver vários formulários diferentes na mesma página.</li>
              )}
            </ul>
          </div>

          <div className="pt-6 border-t space-y-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-bold uppercase tracking-widest block text-primary">WordPress (Recomendado)</Label>
              <Card className="bg-slate-50 border-dashed border-slate-200">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="bg-white p-2 rounded-lg border shadow-sm">
                      <Download className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <h5 className="text-sm font-bold">Instale o Plugin Oficial</h5>
                      <p className="text-xs text-muted-foreground">Baixe e instale nosso plugin para habilitar o shortcode e garantir o rastreamento 100% preciso de UTMs e eventos.</p>
                    </div>
                    <Button size="sm" onClick={() => window.open(`${window.location.origin}/leadflow-official.zip`)} className="gap-2">
                      <Download className="h-4 w-4" /> Download Plugin
                    </Button>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-[10px] font-bold uppercase text-muted-foreground">Shortcode do Formulário</Label>
                    <div className="flex gap-2">
                      <Input value={`[leadflow_form id="${form.id}"]`} readOnly className="bg-white font-mono text-xs" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(`[leadflow_form id="${form.id}"]`, 'shortcode')}>
                        {copied === 'shortcode' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <div className="bg-slate-900 rounded-lg p-4 text-slate-100 space-y-3 shadow-inner">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-[var(--sucesso)]" />
                    <span className="text-xs font-mono font-bold">Monitor de Rastreamento</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-[var(--sucesso-borda)] text-[var(--sucesso)]">ATIVO</Badge>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Para verificar se os UTMs e eventos estão sendo capturados corretamente no WordPress, adicione <code className="text-[var(--sucesso)]">?lf_debug=true</code> ao final da URL do seu site e abra o Console do Navegador (F12).
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    className="w-full text-[10px] h-8 font-bold bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200"
                    onClick={() => toast.info('Adicione ?lf_debug=true na URL do seu site para testar.')}
                  >
                    Como verificar?
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
