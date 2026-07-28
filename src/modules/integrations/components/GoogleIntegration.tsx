import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Globe, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getGoogleAdsAuthUrl,
  getGoogleAdsStatus,
  listGoogleAdsAccounts,
  listGoogleAdsConversionActions,
} from '@/lib/google-oauth.functions';
import { salvarConversaoGoogle } from '@/lib/google-ads.functions';

/**
 * Conexão com o Google Ads.
 *
 * A versão anterior montava a URL de consentimento no navegador e mandava o
 * retorno para `/functions/v1/oauth-callback`, uma Edge Function do Supabase
 * que nunca foi implantada na VPS e responde 500 — o botão levava a lugar
 * nenhum. As abas de contas e conversões liam `google_assets`, alimentada por
 * outra Edge Function igualmente inexistente, e por isso viviam vazias.
 *
 * Agora a URL vem assinada do servidor e o retorno cai numa rota nossa.
 *
 * O botão "Verificar contas" existe por um motivo específico: é a primeira
 * chamada real à API do Google Ads, e é ela que revela se o developer token já
 * foi aprovado para contas de produção. Sem esse teste, o problema só
 * apareceria adiante, com conversões recusadas em silêncio.
 */
interface AcaoConversao {
  id: string;
  nome: string;
  tipo: string | null;
  categoria: string | null;
  conversionId: string | null;
  rotulo: string | null;
}

interface ContaAds {
  id: string;
  nome: string;
  ehGerenciadora: boolean;
  moeda: string | null;
  erro: string | null;
}

export function GoogleIntegration({ companyId }: { companyId: string }) {
  const [carregando, setCarregando] = useState(true);
  const [conectado, setConectado] = useState(false);
  const [conectadoEm, setConectadoEm] = useState<string | null>(null);
  const [redirectUri, setRedirectUri] = useState('');
  const [indoParaGoogle, setIndoParaGoogle] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [contas, setContas] = useState<ContaAds[] | null>(null);
  const [erroApi, setErroApi] = useState<string | null>(null);
  const [contaAberta, setContaAberta] = useState<string | null>(null);
  const [buscandoAcoes, setBuscandoAcoes] = useState(false);
  const [acoes, setAcoes] = useState<AcaoConversao[] | null>(null);

  const abrirConversoes = async (c: ContaAds) => {
    if (contaAberta === c.id) { setContaAberta(null); setAcoes(null); return; }
    setContaAberta(c.id);
    setAcoes(null);
    setBuscandoAcoes(true);
    try {
      const r = await listGoogleAdsConversionActions({
        data: { companyId, customerId: c.id },
      });
      if (r.ok) setAcoes(r.acoes);
      else { setAcoes([]); toast.error('Não deu para ler as conversões', { description: r.erro }); }
    } catch (e) {
      setAcoes([]);
      toast.error('Não deu para ler as conversões', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBuscandoAcoes(false);
    }
  };

  /**
   * Guarda a conversão escolhida. O mesmo clique resolve os dois lados: o
   * `AW-123/rótulo` que o gtag usa no navegador e o nome do recurso que a API
   * usa no servidor — que são identificadores diferentes da mesma conversão.
   */
  const escolher = async (c: ContaAds, a: AcaoConversao, tipo: 'lead' | 'sale') => {
    try {
      await salvarConversaoGoogle({
        data: {
          companyId,
          customerId: c.id,
          conversionActionId: a.id,
          tipo,
          conversionId: a.conversionId,
          rotulo: a.rotulo,
        },
      });
      toast.success(
        tipo === 'lead' ? 'Conversão de lead definida' : 'Conversão de venda definida',
        { description: `${c.nome} · ${a.nome}` },
      );
    } catch (e) {
      toast.error('Não deu para salvar a escolha', {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  useEffect(() => {
    let vivo = true;
    getGoogleAdsStatus({ data: { companyId } })
      .then((s) => {
        if (!vivo) return;
        setConectado(s.conectado);
        setConectadoEm(s.conectadoEm);
        setRedirectUri(s.redirectUri);
      })
      .catch(() => {})
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [companyId]);

  const conectar = async () => {
    setIndoParaGoogle(true);
    try {
      const { url } = await getGoogleAdsAuthUrl({ data: { companyId } });
      window.location.href = url;
    } catch (e) {
      setIndoParaGoogle(false);
      toast.error('Não foi possível iniciar a autorização', {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const verificar = async () => {
    setVerificando(true);
    setErroApi(null);
    setContas(null);
    try {
      const r = await listGoogleAdsAccounts({ data: { companyId } });
      if (r.ok) {
        setContas(r.contas);
        toast.success(`${r.contas.length} conta(s) de anúncio acessível(is)`);
      } else {
        setErroApi(r.erro);
      }
    } catch (e) {
      setErroApi(e instanceof Error ? e.message : String(e));
    } finally {
      setVerificando(false);
    }
  };

  return (
    <Card className="border shadow-none hover:border-primary/20 transition-colors">
      <CardContent className="p-6 flex flex-col h-full gap-4">
        <div className="flex items-start justify-between">
          <div className="h-12 w-12 rounded-xl bg-[#EA4335] flex items-center justify-center text-white shadow-lg">
            <Globe className="h-6 w-6" />
          </div>
          {carregando ? (
            <Badge variant="outline" className="text-muted-foreground">Verificando…</Badge>
          ) : conectado ? (
            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">Conectado</Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">Desconectado</Badge>
          )}
        </div>

        <div>
          <h4 className="font-bold text-base mb-1">Google Ads</h4>
          <p className="text-xs text-muted-foreground">
            Autoriza o Alt Flow Lead a ler suas contas de anúncio e, quando o token estiver
            aprovado, a enviar as conversões de volta.
          </p>
          {conectado && conectadoEm && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Autorizado em {new Date(conectadoEm).toLocaleString('pt-BR')}
            </p>
          )}
        </div>

        <div className="mt-auto space-y-2">
          <Button
            variant={conectado ? 'outline' : 'default'}
            className="w-full text-xs h-10 font-bold"
            onClick={conectar}
            disabled={indoParaGoogle || carregando}
          >
            {indoParaGoogle
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : conectado ? 'Reconectar' : 'Conectar Google Ads'}
          </Button>

          {conectado && (
            <Button
              variant="ghost"
              className="w-full text-xs h-9"
              onClick={verificar}
              disabled={verificando}
            >
              {verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar contas'}
            </Button>
          )}
        </div>

        {contas && (
          <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Contas acessíveis
            </p>
            {contas.length === 0 ? (
              <p className="text-muted-foreground">
                Nenhuma. A conta Google autorizada não enxerga nenhuma conta de anúncio.
              </p>
            ) : (
              <ul className="space-y-1">
                {contas.map((c) => {
                  // Gerenciadora não tem conversão própria e conta desativada
                  // não responde. Deixar as duas clicáveis só levaria a um erro
                  // depois do clique.
                  const selecionavel = !c.ehGerenciadora && !c.erro;
                  const ativa = contaAberta === c.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        disabled={!selecionavel}
                        onClick={() => abrirConversoes(c)}
                        className={`w-full flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
                          selecionavel ? 'hover:bg-background' : 'cursor-default opacity-60'
                        } ${ativa ? 'bg-background ring-1 ring-primary/30' : ''}`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{c.nome}</p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            {c.id}
                            {c.moeda ? ` · ${c.moeda}` : ''}
                            {c.erro ? ` · ${c.erro}` : ''}
                          </p>
                        </div>
                        {c.ehGerenciadora && (
                          <Badge variant="outline" className="shrink-0 text-[9px] uppercase">
                            Gerenciadora
                          </Badge>
                        )}
                        {ativa && buscandoAcoes && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
                      </button>

                      {ativa && acoes && (
                        <div className="ml-2 mt-1 space-y-1 border-l pl-3">
                          {acoes.length === 0 ? (
                            <p className="text-muted-foreground">
                              Nenhuma conversão ativa nesta conta.
                            </p>
                          ) : (
                            acoes.map((a) => (
                              <div key={a.id} className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate">{a.nome}</p>
                                  <p className="font-mono text-[10px] text-muted-foreground">
                                    {a.conversionId && a.rotulo
                                      ? `${a.conversionId}/${a.rotulo}`
                                      : 'sem snippet de gtag'}
                                  </p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px]"
                                    onClick={() => escolher(c, a, 'lead')}
                                  >
                                    Usar p/ lead
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px]"
                                    onClick={() => escolher(c, a, 'sale')}
                                  >
                                    Usar p/ venda
                                  </Button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {erroApi && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs space-y-1">
            <p className="font-bold flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              O Google recusou
            </p>
            <p className="text-muted-foreground break-words">{erroApi}</p>
            {/* Erro mais provável numa primeira configuração. Explicado aqui
                porque a mensagem do Google não diz o que fazer a respeito. */}
            {/DEVELOPER_TOKEN_NOT_APPROVED|not approved/i.test(erroApi) && (
              <p className="text-muted-foreground">
                O developer token ainda está no nível de teste, que só funciona em contas de
                teste. Peça acesso básico no API Center do Google Ads — a aprovação libera o uso
                na conta real.
              </p>
            )}
          </div>
        )}

        {!carregando && !conectado && redirectUri && (
          <p className="text-[11px] text-muted-foreground">
            Cadastre este endereço em "URIs de redirecionamento autorizados" no Google Cloud:{' '}
            <code className="bg-muted px-1 rounded break-all">{redirectUri}</code>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
