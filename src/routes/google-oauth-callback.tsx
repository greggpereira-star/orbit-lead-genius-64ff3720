import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { exchangeGoogleAdsCode } from '@/lib/google-oauth.functions';

/**
 * Retorno do consentimento do Google.
 *
 * Este endereço é o que precisa estar cadastrado em "URIs de redirecionamento
 * autorizados" no Google Cloud. Se não estiver, o Google nem chega aqui — ele
 * barra antes, com `redirect_uri_mismatch` na própria tela dele.
 */
const searchSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute('/google-oauth-callback')({
  validateSearch: (s) => searchSchema.parse(s),
  component: GoogleOAuthCallback,
});

function GoogleOAuthCallback() {
  const { code, state, error } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'trocando' | 'ok' | 'falhou'>('trocando');
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    if (error) {
      setStatus('falhou');
      setMensagem(
        error === 'access_denied'
          ? 'Você cancelou a autorização no Google.'
          : `O Google recusou a autorização: ${error}`,
      );
      return;
    }
    if (!code || !state) {
      setStatus('falhou');
      setMensagem('O Google não devolveu o código de autorização.');
      return;
    }

    exchangeGoogleAdsCode({ data: { code, state } })
      .then(() => setStatus('ok'))
      .catch((e: unknown) => {
        setStatus('falhou');
        setMensagem(e instanceof Error ? e.message : String(e));
      });
    // Trocar o código é operação de uma vez só: o Google invalida o `code` no
    // primeiro uso, então repetir por mudança de dependência daria erro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center space-y-4">
        {status === 'trocando' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <h1 className="text-lg font-bold">Conectando ao Google Ads…</h1>
            <p className="text-sm text-muted-foreground">Guardando a autorização no servidor.</p>
          </>
        )}

        {status === 'ok' && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
            <h1 className="text-lg font-bold">Google Ads conectado</h1>
            <p className="text-sm text-muted-foreground">
              A autorização ficou guardada no servidor. Agora dá para listar as contas de anúncio
              e escolher a conversão.
            </p>
            <Button className="w-full" onClick={() => navigate({ to: '/settings/integrations' })}>
              Voltar para Integrações
            </Button>
          </>
        )}

        {status === 'falhou' && (
          <>
            <XCircle className="h-10 w-10 text-destructive mx-auto" />
            <h1 className="text-lg font-bold">Não deu para conectar</h1>
            <p className="text-sm text-muted-foreground break-words">{mensagem}</p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate({ to: '/settings/integrations' })}
            >
              Voltar para Integrações
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
