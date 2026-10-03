import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link2, Copy, Check, Trash2, Loader2, Plus } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  listRedirectLinks, criarRedirectLink, alternarRedirectLink, excluirRedirectLink, gerarSlug,
} from '@/modules/crm/services/redirectLinkService';

/**
 * Links de anúncio → WhatsApp.
 *
 * Fica na página do WhatsApp porque o destino é um número de WhatsApp: quem vem
 * configurar isso já está pensando em "para qual número o anúncio manda".
 *
 * A ação principal não é criar, é COPIAR: o link nasce uma vez e é colado em
 * toda campanha depois. Por isso o botão de copiar é o que tem destaque, e não
 * fica escondido num menu.
 */
export function RedirectLinksCard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [destino, setDestino] = useState('');
  const [copiado, setCopiado] = useState<string | null>(null);

  const links = useQuery({
    queryKey: ['redirect-links', companyId],
    queryFn: () => listRedirectLinks(companyId),
    enabled: Boolean(companyId),
  });

  const invalidar = () => qc.invalidateQueries({ queryKey: ['redirect-links', companyId] });

  const criar = useMutation({
    mutationFn: () => criarRedirectLink({
      companyId, nome, destinoPhone: destino,
      mensagem: 'Olá! Vim pelo anúncio. [{{codigo}}]',
    }),
    onSuccess: () => { setNome(''); setDestino(''); setCriando(false); invalidar(); },
    onError: (e: Error) => toast.error('Não deu para criar', { description: e.message }),
  });

  const alternar = useMutation({
    mutationFn: (p: { id: string; ativo: boolean }) => alternarRedirectLink(p.id, p.ativo),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => excluirRedirectLink(id),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const urlDe = (slug: string) =>
    `${typeof window === 'undefined' ? 'https://altleadflow.com.br' : window.location.origin}/ir/${slug}`;

  const copiar = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(urlDe(slug));
      setCopiado(slug);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      // Área de transferência bloqueada acontece em contexto sem HTTPS ou com
      // permissão negada. Dizer isso é melhor que um botão que não reage.
      toast.error('Seu navegador bloqueou a cópia', { description: urlDe(slug) });
    }
  };

  const lista = links.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          Links de anúncio
        </CardTitle>
        <CardDescription>
          Use no Google Ads, que não tem botão de WhatsApp. O link identifica de qual
          campanha veio cada conversa.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {lista.map((l) => (
          <div key={l.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{l.nome}</span>
              <span className="text-xs text-muted-foreground">→ {l.destino_phone}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <Switch
                  checked={l.is_active}
                  onCheckedChange={(v) => alternar.mutate({ id: l.id, ativo: v })}
                  aria-label={`${l.is_active ? 'Desligar' : 'Ligar'} o link ${l.nome}`}
                />
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => excluir.mutate(l.id)}
                  aria-label={`Excluir o link ${l.nome}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">
                {urlDe(l.slug)}
              </code>
              <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => copiar(l.slug)}>
                {copiado === l.slug ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                {copiado === l.slug ? 'Copiado' : 'Copiar'}
              </Button>
            </div>

            {/* Os dois números juntos, porque a diferença entre eles É a
                informação: quem clicou e não mandou mensagem desistiu no meio. */}
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{l.cliques}</span> clique(s) ·{' '}
              <span className="font-medium text-foreground">{l.conversas}</span> viraram conversa
              {l.cliques > 0 && l.conversas < l.cliques && (
                <> · {l.cliques - l.conversas} abriram o WhatsApp e não enviaram</>
              )}
            </p>
          </div>
        ))}

        {!links.isLoading && lista.length === 0 && !criando && (
          <p className="py-2 text-sm text-muted-foreground">
            Nenhum link ainda. Crie um para usar nas campanhas do Google.
          </p>
        )}

        {criando ? (
          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome da campanha (ex.: Sol e Mar — Julho)"
              className="h-9"
              aria-label="Nome do link"
            />
            {nome && (
              <p className="text-xs text-muted-foreground">
                Endereço: <code className="rounded bg-muted px-1">/ir/{gerarSlug(nome)}</code>
              </p>
            )}
            <Input
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              placeholder="Número com país e DDD (ex.: 5527999998888)"
              inputMode="numeric"
              className="h-9"
              aria-label="Número de destino"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => criar.mutate()} disabled={criar.isPending || !nome || !destino}>
                {criar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Criar link
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCriando(false)}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setCriando(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
