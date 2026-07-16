import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, CheckCircle2, XCircle, Download, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/_app/settings/install')({
  component: InstallGuide,
});

function InstallGuide() {
  const { company } = useAuth();
  const companyId = company?.id ?? 'SEU_COMPANY_ID';
  const host = typeof window !== 'undefined' ? window.location.origin : 'https://www.altleadflow.com.br';

  const snippet = `<script src="${host}/chat-widget.js"
  data-company-id="${companyId}"
  data-color="#4f46e5"
  data-invite-message="Posso ajudar? 👋"
  data-invite-delay="8"
  defer></script>`;

  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<null | boolean>(null);
  const [lastSeen, setLastSeen] = useState<string | null>(null);

  const copy = () => {
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    toast.success('Snippet copiado');
    setTimeout(() => setCopied(false), 2000);
  };

  const verify = async () => {
    if (!company?.id) return;
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('chat_conversations' as never)
        .select('created_at' as never)
        .eq('company_id' as never, company.id as never)
        .order('created_at' as never, { ascending: false })
        .limit(1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as { created_at: string }[];
      if (rows.length) {
        setVerified(true);
        setLastSeen(rows[0].created_at);
      } else {
        setVerified(false);
        setLastSeen(null);
      }
    } catch {
      setVerified(false);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Instalação guiada</h2>
        <p className="text-muted-foreground text-sm">
          Siga os 3 passos abaixo para colocar o chat ao vivo no seu site em menos de 2 minutos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
            Copie o snippet
          </CardTitle>
          <CardDescription>Este código já vem configurado com o ID da sua empresa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative">
            <pre className="bg-muted text-foreground text-xs p-4 rounded-lg overflow-x-auto border">
              <code>{snippet}</code>
            </pre>
            <Button size="sm" variant="secondary" className="absolute top-2 right-2 gap-1" onClick={copy}>
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Precisa personalizar cor, mensagem ou tempo?{' '}
            <Link to="/settings/widgets" className="text-primary underline">
              Abra o gerador de snippets
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
            Instale no seu site
          </CardTitle>
          <CardDescription>Escolha a opção que combina com sua tecnologia.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="border rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm">Site HTML / React / Vue</h4>
            <p className="text-xs text-muted-foreground">
              Cole o snippet antes da tag <code className="text-[10px]">&lt;/body&gt;</code> em todas as páginas.
            </p>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm">WordPress</h4>
            <p className="text-xs text-muted-foreground">Baixe o plugin oficial e ative — nada de mexer no código.</p>
            <Button asChild size="sm" variant="outline" className="gap-2">
              <a href="https://www.altleadflow.com.br/leadflow-official.zip" download>
                <Download className="h-3 w-3" /> Baixar plugin
              </a>
            </Button>
          </div>
          <div className="border rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm">Google Tag Manager</h4>
            <p className="text-xs text-muted-foreground">
              Crie uma tag "HTML personalizado", cole o snippet e dispare em "Todas as páginas".
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
            Verifique a instalação
          </CardTitle>
          <CardDescription>
            Abra o seu site, envie uma mensagem de teste pelo chat e clique em "Verificar" para confirmar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={verify} disabled={checking} className="gap-2">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Verificar instalação
          </Button>
          {verified === true && (
            <div className="flex items-start gap-2 rounded-lg border border-green-500/40 bg-green-500/10 p-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div>
                <p className="font-medium">Widget conectado com sucesso!</p>
                {lastSeen && (
                  <p className="text-xs text-muted-foreground">
                    Última conversa em {new Date(lastSeen).toLocaleString('pt-BR')}
                  </p>
                )}
                <Button asChild size="sm" variant="link" className="px-0 h-auto gap-1">
                  <Link to="/inbox">
                    Ir para o Chat ao vivo <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
          {verified === false && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <XCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-medium">Ainda não recebemos nenhuma conversa</p>
                <p className="text-xs text-muted-foreground">
                  Confirme que o snippet está publicado no site e envie uma mensagem de teste pelo widget.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
