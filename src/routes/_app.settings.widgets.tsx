import { createFileRoute } from '@tanstack/react-router';
import { useState, useMemo } from 'react';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, Check, MessageSquare, Phone } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/settings/widgets')({
  component: WidgetsSettings,
});

function SnippetBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="bg-muted text-foreground text-xs p-4 rounded-lg overflow-x-auto border">
        <code>{code}</code>
      </pre>
      <Button
        size="sm"
        variant="secondary"
        className="absolute top-2 right-2 gap-1"
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(true);
          toast.success('Snippet copiado');
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copiado' : 'Copiar'}
      </Button>
    </div>
  );
}

function WidgetsSettings() {
  const { company } = useAuth();
  const companyId = company?.id ?? 'SEU_COMPANY_ID';
  const host = typeof window !== 'undefined' ? window.location.origin : 'https://www.altleadflow.com.br';

  const [chatColor, setChatColor] = useState('#4f46e5');
  const [inviteMessage, setInviteMessage] = useState('Posso ajudar? 👋');
  const [inviteDelay, setInviteDelay] = useState('8');
  const [waPhone, setWaPhone] = useState('5511999999999');
  const [waMessage, setWaMessage] = useState('Olá! Vim pelo site e quero saber mais.');
  const [waLabel, setWaLabel] = useState('Fale no WhatsApp');
  const [waColor, setWaColor] = useState('#25D366');

  const chatSnippet = useMemo(
    () => `<script src="${host}/chat-widget.js"
  data-company-id="${companyId}"
  data-color="${chatColor}"${inviteMessage ? `
  data-invite-message="${inviteMessage}"
  data-invite-delay="${inviteDelay || '0'}"` : ''}
  defer></script>`,
    [host, companyId, chatColor, inviteMessage, inviteDelay],
  );

  const waSnippet = useMemo(
    () => `<script src="${host}/whatsapp-widget.js"
  data-company-id="${companyId}"
  data-phone="${waPhone}"
  data-message="${waMessage}"
  data-label="${waLabel}"
  data-color="${waColor}"
  data-position="bottom-right" defer></script>`,
    [host, companyId, waPhone, waMessage, waLabel, waColor],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Widgets para o seu site</h2>
        <p className="text-muted-foreground text-sm">
          Instale o chat ao vivo e o botão de WhatsApp em qualquer site. Todos os cliques e conversas são rastreados
          automaticamente (UTMs, fbclid, gclid) e viram leads no seu CRM.
        </p>
      </div>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="chat" className="gap-2">
            <MessageSquare className="h-4 w-4" /> Chat ao vivo
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-2">
            <Phone className="h-4 w-4" /> WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Chat ao vivo</CardTitle>
              <CardDescription>
                Widget flutuante que abre uma conversa em tempo real com sua equipe no Inbox.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="chat-color">Cor do botão</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="chat-color"
                      type="color"
                      value={chatColor}
                      onChange={(e) => setChatColor(e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input value={chatColor} onChange={(e) => setChatColor(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-delay">Convite proativo após (segundos)</Label>
                  <Input
                    id="invite-delay"
                    type="number"
                    min="0"
                    value={inviteDelay}
                    onChange={(e) => setInviteDelay(e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="invite-msg">Mensagem do convite (vazio = desativado)</Label>
                  <Input
                    id="invite-msg"
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    placeholder="Posso ajudar? 👋"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cole antes do &lt;/body&gt; do seu site</Label>
                <SnippetBox code={chatSnippet} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Botão de WhatsApp rastreável</CardTitle>
              <CardDescription>
                Redireciona para o wa.me registrando UTMs, fbclid e cria um lead se o visitante deixar contato.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="wa-phone">Número (com DDI, só dígitos)</Label>
                  <Input id="wa-phone" value={waPhone} onChange={(e) => setWaPhone(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wa-label">Texto do botão</Label>
                  <Input id="wa-label" value={waLabel} onChange={(e) => setWaLabel(e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="wa-msg">Mensagem pré-preenchida</Label>
                  <Input id="wa-msg" value={waMessage} onChange={(e) => setWaMessage(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wa-color">Cor</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      id="wa-color"
                      type="color"
                      value={waColor}
                      onChange={(e) => setWaColor(e.target.value)}
                      className="w-16 h-10 p-1"
                    />
                    <Input value={waColor} onChange={(e) => setWaColor(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cole antes do &lt;/body&gt; do seu site</Label>
                <SnippetBox code={waSnippet} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
