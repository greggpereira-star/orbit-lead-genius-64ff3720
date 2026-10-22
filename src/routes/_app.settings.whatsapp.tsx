import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  listarAvisosDaMetaWhatsApp,
  apagarRascunhoTemplateWhatsApp,
  apagarTemplateWhatsApp,
  concluirSignupWhatsApp,
  obterSituacaoDosNumerosWhatsApp,
  definirApenasReceptivoWhatsApp,
  obterEstadoDoWhatsAppOficial,
  sincronizarTemplatesWhatsApp,
} from "@/lib/whatsapp-cloud.functions";
import { useAuth } from "@/core/auth/hooks/useAuth";
import {
  avaliarCorteWhatsApp,
  executarCorteEvolutionWhatsApp,
} from "@/lib/whatsapp-atendimento.functions";
import { confirmacaoConfere, FRASE_DO_CORTE } from "@/lib/whatsapp/corte";
import { usoPorCategoria } from "@/modules/atendimento/hooks/useAtendimento";
import { lerMensagemDoSignup, opcoesDoLogin } from "@/lib/whatsapp/cloud/signup";
import { situacaoDoNumeroNaMeta } from "@/lib/whatsapp/cloud/situacaoDoNumero";
import type { DefinicaoDeTemplate } from "@/lib/whatsapp/cloud/templates";
import { ConexaoManual } from "@/modules/atendimento/components/ConexaoManual";
import { DEFINICAO_VAZIA, NovoTemplate } from "@/modules/atendimento/components/NovoTemplate";
import { rotuloDaJanela } from "@/lib/whatsapp/cloud/janela";

export const Route = createFileRoute("/_app/settings/whatsapp")({
  component: WhatsAppOficial,
});

declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (
        cb: (r: { authResponse?: { code?: string } | null }) => void,
        o: Record<string, unknown>,
      ) => void;
    };
    fbAsyncInit?: () => void;
  }
}

const VERSAO_DO_SDK = "v25.0";

/** Carrega o SDK do Facebook uma única vez. */
function carregarSdk(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve();
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: VERSAO_DO_SDK });
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true;
    s.defer = true;
    s.onerror = () =>
      reject(new Error("Não consegui carregar o SDK da Meta (bloqueador de anúncios?)."));
    document.body.appendChild(s);
  });
}

const COR_DA_QUALIDADE: Record<string, string> = {
  GREEN: "text-[var(--sucesso)]",
  YELLOW: "text-[var(--aviso)]",
  RED: "text-destructive",
};
const ROTULO_DA_QUALIDADE: Record<string, string> = {
  GREEN: "Alta",
  YELLOW: "Média",
  RED: "Baixa",
};

function WhatsAppOficial() {
  const qc = useQueryClient();
  const buscar = useServerFn(obterEstadoDoWhatsAppOficial);
  const concluir = useServerFn(concluirSignupWhatsApp);
  const sincronizar = useServerFn(sincronizarTemplatesWhatsApp);
  const apagar = useServerFn(apagarTemplateWhatsApp);

  const estado = useQuery({ queryKey: ["wa-oficial"], queryFn: () => buscar() });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["wa-oficial"] });

  // O SDK entrega o `code` no callback do login e os IDs em uma mensagem à parte.
  // Os dois precisam estar presentes; chegam em ordem não garantida.
  const pendente = useRef<{ code?: string; wabaId?: string; phoneNumberId?: string | null }>({});
  const [conectando, setConectando] = useState(false);

  const tentarConcluir = useCallback(async () => {
    const p = pendente.current;
    if (!p.code || !p.wabaId || !p.phoneNumberId) return;
    pendente.current = {};
    try {
      const r = await concluir({
        data: { code: p.code, wabaId: p.wabaId, phoneNumberId: p.phoneNumberId },
      });
      toast.success(
        r.numero.modo === "coexistence"
          ? "WhatsApp conectado. O histórico do aplicativo começa a sincronizar."
          : "WhatsApp conectado.",
      );
      recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir a conexão.");
    } finally {
      setConectando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concluir]);

  useEffect(() => {
    const ouvir = (ev: MessageEvent) => {
      const m = lerMensagemDoSignup(ev.origin, ev.data);
      if (m.tipo === "ignorada") return;
      if (m.tipo === "concluido") {
        pendente.current.wabaId = m.wabaId;
        pendente.current.phoneNumberId = m.phoneNumberId;
        void tentarConcluir();
      } else if (m.tipo === "cancelado") {
        setConectando(false);
        toast.message("Conexão cancelada.");
      } else {
        setConectando(false);
        toast.error(m.texto);
      }
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [tentarConcluir]);

  async function conectar(coexistencia: boolean) {
    const amb = estado.data?.ambiente;
    if (!amb?.appId || !amb.configId) {
      toast.error("Faltam META_APP_ID e WA_ES_CONFIG_ID no servidor.");
      return;
    }
    setConectando(true);
    pendente.current = {};
    try {
      await carregarSdk(amb.appId);
      window.FB!.login(
        (resp) => {
          const code = resp.authResponse?.code;
          if (!code) {
            setConectando(false);
            return;
          }
          pendente.current.code = code;
          void tentarConcluir();
        },
        opcoesDoLogin({ configId: amb.configId, coexistencia }) as unknown as Record<
          string,
          unknown
        >,
      );
    } catch (e) {
      setConectando(false);
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar a conexão.");
    }
  }

  const sync = useMutation({
    mutationFn: () => sincronizar({ data: { accountId: contaId } }),
    onSuccess: (r) => {
      toast.success(`${r.total} template(s) sincronizado(s).`);
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: (nome: string) => apagar({ data: { nome, accountId: contaId } }),
    onSuccess: () => {
      toast.success("Template apagado.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [criando, setCriando] = useState(false);
  /** Rascunho aberto no editor (null = template novo). */
  const [rascunho, setRascunho] = useState<{ id: string; def: DefinicaoDeTemplate } | null>(null);
  const definirReceptivo = useServerFn(definirApenasReceptivoWhatsApp);
  const alternarReceptivo = useMutation({
    mutationFn: (v: { phoneNumberId: string; valor: boolean }) => definirReceptivo({ data: v }),
    onSuccess: (r) => {
      toast.success(
        r.valor ? "Número apenas receptivo." : "Número volta a enviar mensagens ativas.",
      );
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const apagarRascunho = useServerFn(apagarRascunhoTemplateWhatsApp);
  const removerRascunho = useMutation({
    mutationFn: (id: string) => apagarRascunho({ data: { id } }),
    onSuccess: () => {
      toast.success("Rascunho apagado.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const d = estado.data;
  const numeros = d?.numeros ?? [];

  // "Ativo" aqui é só "conectado ao Leadflow": quem diz se o número envia é a Meta. É uma
  // consulta à parte (uma chamada externa por conta) para a tela não esperar por ela.
  const buscarSituacao = useServerFn(obterSituacaoDosNumerosWhatsApp);
  const situacao = useQuery({
    queryKey: ["wa-situacao-numeros"],
    queryFn: () => buscarSituacao(),
    enabled: numeros.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const situacaoDe = (id: string) => situacao.data?.find((x) => x.phone_number_id === id);

  // Template é da CONTA (WABA), não da empresa: com mais de uma conta o autor escolhe qual.
  const contas = Array.from(
    numeros.reduce((m, n) => {
      m.set(n.account_id, [...(m.get(n.account_id) ?? []), n.display_phone]);
      return m;
    }, new Map<string, string[]>()),
    ([id, fones]) => ({ id, rotulo: fones.join(" · ") }),
  );
  const [contaEscolhida, setContaEscolhida] = useState<string | null>(null);
  const contaId = contas.find((c) => c.id === contaEscolhida)?.id ?? contas[0]?.id;
  const templatesDaConta = (d?.templates ?? []).filter((t) => t.account_id === contaId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <MessageCircle className="h-5 w-5" /> WhatsApp Business (API oficial)
        </h2>
        <p className="text-sm text-muted-foreground">
          Conexão do número pela Meta, saúde do envio e templates de mensagem.
        </p>
      </div>

      {estado.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {estado.error && (
        <p className="text-sm text-destructive">Não foi possível carregar o estado.</p>
      )}

      {d && !d.migracaoAplicada && (
        <Card className="border-[var(--aviso)]">
          <CardContent className="pt-6 flex gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--aviso)]" />
            <p>
              As tabelas do WhatsApp oficial ainda não existem neste banco. Aplique as migrações{" "}
              <code>20261015180000_wa_fundacao</code> e{" "}
              <code>20261015190000_wa_templates_e_estado</code>.
            </p>
          </CardContent>
        </Card>
      )}

      {d && d.migracaoAplicada && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Número conectado
              </CardTitle>
              <CardDescription>
                O número continua funcionando no aplicativo WhatsApp Business do celular; as
                conversas também chegam aqui.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {numeros.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">Nenhum número conectado.</p>
                  <Requisitos amb={d.ambiente} />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={conectando || !d.ambiente.appId || !d.ambiente.configId}
                      onClick={() => conectar(true)}
                    >
                      {conectando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Conectar número do WhatsApp Business
                    </Button>
                    <Button
                      variant="outline"
                      disabled={conectando || !d.ambiente.appId || !d.ambiente.configId}
                      onClick={() => conectar(false)}
                    >
                      Número que não está no aplicativo
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Para manter o aplicativo no celular o número precisa estar no WhatsApp Business
                    há pelo menos 7 dias.
                  </p>
                  <ConexaoManual onConectado={recarregar} />
                </div>
              )}

              {numeros.map((n) => (
                <div key={n.phone_number_id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium tabular-nums">+{n.display_phone}</div>
                    <div className="flex gap-2">
                      <Badge variant={n.status === "active" ? "default" : "destructive"}>
                        {n.status === "active" ? "Ativo no Leadflow" : "Desconectado"}
                      </Badge>
                      <SituacaoNaMeta
                        carregando={situacao.isLoading}
                        lida={situacaoDe(n.phone_number_id)}
                        falhou={situacao.isError}
                      />
                      <Badge variant="secondary">
                        {n.mode === "coexistence" ? "Coexistência" : "Somente API"}
                      </Badge>
                    </div>
                  </div>

                  <AvisoDaSituacao lida={situacaoDe(n.phone_number_id)} />

                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4">
                    <Dado rotulo="Qualidade">
                      <span className={COR_DA_QUALIDADE[n.quality ?? ""] ?? ""}>
                        {ROTULO_DA_QUALIDADE[n.quality ?? ""] ?? "—"}
                      </span>
                    </Dado>
                    <Dado rotulo="Limite diário">{n.messaging_tier ?? "—"}</Dado>
                    <Dado rotulo="Recebimento">
                      {n.webhook_subscribed_at ? (
                        <span className="inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[var(--sucesso)]" /> ativo
                        </span>
                      ) : (
                        <span className="text-destructive">não inscrito</span>
                      )}
                    </Dado>
                    <Dado rotulo="Histórico">
                      {n.mode !== "coexistence"
                        ? "—"
                        : n.coexistence_synced_at
                          ? "sincronizado"
                          : `${n.history_progress ?? 0}%`}
                    </Dado>
                  </dl>

                  <div className="flex items-start justify-between gap-4 rounded-md bg-muted/40 p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor={`recep-${n.phone_number_id}`} className="text-sm">
                        Apenas receptivo
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        O número só responde a quem escreveu, dentro da janela de 24h: não envia
                        template (mensagem ativa) e não é usado por automações nem campanhas.
                      </p>
                    </div>
                    <Switch
                      id={`recep-${n.phone_number_id}`}
                      checked={Boolean(n.receive_only)}
                      disabled={alternarReceptivo.isPending}
                      onCheckedChange={(valor) =>
                        alternarReceptivo.mutate({ phoneNumberId: n.phone_number_id, valor })
                      }
                    />
                  </div>

                  {n.status === "disconnected" && (
                    <p className="text-sm text-destructive">
                      Desconectado{n.disconnection_reason ? `: ${n.disconnection_reason}` : ""}.
                      Reconecte o número.
                    </p>
                  )}
                  {n.mode === "coexistence" && n.is_on_biz_app === false && (
                    <p className="text-sm text-[var(--aviso)]">
                      O número deixou de estar no aplicativo WhatsApp Business. Abra o aplicativo
                      para manter a coexistência (a Meta pede que seja aberto ao menos a cada ~13
                      dias).
                    </p>
                  )}
                </div>
              ))}

              {/* Com número já conectado o formulário sumia, e não havia como ligar outro
                  (por exemplo o número de teste da Meta) sem apagar o existente. */}
              {numeros.length > 0 && <ConexaoManual onConectado={recarregar} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Templates de mensagem</CardTitle>
                <CardDescription>
                  Fora da janela de {rotuloDaJanela(24 * 3600 * 1000)}, só é possível enviar
                  template aprovado.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {contas.length > 1 && (
                  <Select value={contaId} onValueChange={setContaEscolhida}>
                    <SelectTrigger
                      className="h-8 w-auto min-w-[11rem]"
                      aria-label="Conta dos templates"
                    >
                      <SelectValue placeholder="Conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={sync.isPending || numeros.length === 0}
                  onClick={() => sync.mutate()}
                >
                  {sync.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Sincronizar
                </Button>
                <Button
                  size="sm"
                  disabled={numeros.length === 0}
                  onClick={() => {
                    setRascunho(null);
                    setCriando(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Novo template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {(d.rascunhos ?? []).length > 0 && (
                <div className="mb-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Rascunhos ({d.rascunhos.length}) · ainda não enviados à Meta
                  </p>
                  <ul className="divide-y rounded-md border">
                    {d.rascunhos.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 p-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {r.name || "(sem nome)"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            salvo em{" "}
                            {new Date(r.updated_at).toLocaleString("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRascunho({
                                id: r.id,
                                def: { ...DEFINICAO_VAZIA, ...r.definition },
                              });
                              setCriando(true);
                            }}
                          >
                            Continuar
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Apagar rascunho ${r.name || ""}`}
                            disabled={removerRascunho.isPending}
                            onClick={() => {
                              if (window.confirm("Apagar este rascunho?"))
                                removerRascunho.mutate(r.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {templatesDaConta.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {contas.length > 1
                    ? "Nenhum template nesta conta ainda."
                    : "Nenhum template ainda."}
                </p>
              ) : (
                <ul className="divide-y">
                  {templatesDaConta.map((t) => (
                    <li key={t.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-sm">
                          {t.name}{" "}
                          <span className="text-muted-foreground font-normal">· {t.language}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{t.category}</div>
                        {t.rejection_reason && (
                          <div className="text-xs text-destructive mt-1">
                            Motivo: {t.rejection_reason}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant={
                            t.status === "APPROVED"
                              ? "default"
                              : t.status === "PENDING"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {t.status === "APPROVED"
                            ? "Aprovado"
                            : t.status === "PENDING"
                              ? "Em análise"
                              : t.status}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Apagar ${t.name}`}
                          disabled={remover.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Apagar o template "${t.name}"? Isso o remove na Meta, em todos os idiomas.`,
                              )
                            ) {
                              remover.mutate(t.name);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {d && d.migracaoAplicada && numeros.length > 0 && (
        <>
          <AvisosDaMeta />
          <UsoDoMes />
          <CorteDaEvolution />
        </>
      )}

      <NovoTemplate
        key={rascunho?.id ?? "novo"}
        aberto={criando}
        inicial={rascunho}
        accountId={contaId}
        contaRotulo={contas.length > 1 ? contas.find((c) => c.id === contaId)?.rotulo : undefined}
        onFechar={() => setCriando(false)}
        onCriado={recarregar}
      />
    </div>
  );
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Requisitos({
  amb,
}: {
  amb: {
    appId: string | null;
    configId: string | null;
    temSegredoDoApp: boolean;
    temChaveDeCifra: boolean;
    temTokenDeVerificacao: boolean;
  };
}) {
  const itens: Array<[string, boolean]> = [
    ["META_APP_ID", Boolean(amb.appId)],
    ["META_APP_SECRET", amb.temSegredoDoApp],
    ["WA_ES_CONFIG_ID", Boolean(amb.configId)],
    ["WA_TOKEN_KEY", amb.temChaveDeCifra],
    ["WA_WEBHOOK_VERIFY_TOKEN", amb.temTokenDeVerificacao],
  ];
  const faltando = itens.filter(([, ok]) => !ok).map(([n]) => n);
  if (faltando.length === 0) return null;
  return (
    <p className="text-sm text-[var(--aviso)]">
      Faltam variáveis no servidor: <code>{faltando.join(", ")}</code>.
    </p>
  );
}

const ROTULO_DA_CATEGORIA: Record<string, string> = {
  marketing: "Marketing",
  utility: "Utilidade",
  authentication: "Autenticação",
  service: "Atendimento (resposta dentro de 24h)",
  referral_conversion: "Conversão de anúncio",
  desconhecida: "Sem categoria informada",
};

/**
 * Mensagens cobráveis do mês por categoria, como a Meta informou.
 * É CONTAGEM: o valor em reais depende da tabela de preços vigente da Meta, que
 * não é dado do sistema — mostrar um número em R$ aqui seria inventá-lo.
 */
/**
 * Avisos da Meta: eventos da conta que o sistema recebe e não trata sozinho. Sem
 * isto, restrição ou queda de qualidade só aparecia quando o envio parava.
 */
function AvisosDaMeta() {
  const buscar = useServerFn(listarAvisosDaMetaWhatsApp);
  const avisos = useQuery({
    queryKey: ["wa-avisos-meta"],
    queryFn: () => buscar(),
    staleTime: 60_000,
  });
  const lista = avisos.data ?? [];
  if (avisos.isLoading || avisos.error || lista.length === 0) return null;
  const altas = lista.filter((a) => a.gravidade === "alta").length;
  return (
    <Card className={altas > 0 ? "border-destructive/50" : undefined}>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle
            className={altas > 0 ? "h-4 w-4 text-destructive" : "h-4 w-4 text-muted-foreground"}
          />
          Avisos da Meta
          {altas > 0 && <Badge variant="destructive">{altas} para ver agora</Badge>}
        </CardTitle>
        <CardDescription>
          Eventos da sua conta que o sistema recebeu e não trata sozinho. O nome aparece como a Meta
          enviou; confirme o significado no Gerenciador do WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {lista.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-3 py-2">
              <div className="min-w-0">
                <p
                  className={
                    a.gravidade === "alta" ? "font-medium text-destructive" : "font-medium"
                  }
                >
                  {a.titulo}
                </p>
                {a.detalhe && <p className="truncate text-xs text-muted-foreground">{a.detalhe}</p>}
              </div>
              <time className="shrink-0 text-xs text-muted-foreground" dateTime={a.quando}>
                {new Date(a.quando).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </time>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function UsoDoMes() {
  const { company } = useAuth();
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  const uso = useQuery({
    queryKey: ["wa-uso", company?.id, inicio.toISOString()],
    queryFn: () => usoPorCategoria(company!.id, inicio, fim),
    enabled: Boolean(company?.id),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Uso do mês</CardTitle>
        <CardDescription>
          Mensagens por categoria, conforme o que a Meta informa. O valor depende da tabela de
          preços da Meta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {uso.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
        {uso.error && <p className="text-sm text-destructive">Não foi possível carregar o uso.</p>}
        {uso.data && uso.data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma mensagem com cobrança informada neste mês.
          </p>
        )}
        {uso.data && uso.data.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 font-medium">Categoria</th>
                <th className="py-1 font-medium">Cobrança</th>
                <th className="py-1 text-right font-medium">Mensagens</th>
              </tr>
            </thead>
            <tbody>
              {uso.data.map((l) => (
                <tr key={`${l.categoria}-${l.cobravel}`} className="border-t">
                  <td className="py-1.5">{ROTULO_DA_CATEGORIA[l.categoria] ?? l.categoria}</td>
                  <td className="py-1.5">{l.cobravel ? "Cobrada" : "Gratuita"}</td>
                  <td className="py-1.5 text-right tabular-nums">{l.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Desligar a conexão antiga (Evolution) — IRREVERSÍVEL. Só libera quando cada
 * pré-requisito é um fato medido; a frase de confirmação existe para o clique
 * não ser acidental, e o servidor reavalia tudo antes de executar.
 */
function CorteDaEvolution() {
  const qc = useQueryClient();
  const avaliar = useServerFn(avaliarCorteWhatsApp);
  const cortar = useServerFn(executarCorteEvolutionWhatsApp);
  const [frase, setFrase] = useState("");

  const q = useQuery({ queryKey: ["wa-corte"], queryFn: () => avaliar() });
  const executar = useMutation({
    mutationFn: () => cortar({ data: { confirmacao: frase } }),
    onSuccess: () => {
      toast.success("Conexão antiga removida. O atendimento segue pela API oficial.");
      setFrase("");
      qc.invalidateQueries({ queryKey: ["wa-corte"] });
      qc.invalidateQueries({ queryKey: ["wa-oficial"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Sem instância antiga não há o que cortar: o cartão some.
  if (!q.data || !q.data.fatos.temInstanciaEvolution) return null;
  const { itens, pronto } = q.data;

  return (
    <Card className="border-[var(--aviso)]/50">
      <CardHeader>
        <CardTitle className="text-base">Desligar a conexão antiga (Evolution)</CardTitle>
        <CardDescription>
          Remove a sessão pareada por QR code. Não dá para desfazer: para voltar seria preciso
          parear de novo com o celular.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {itens.map((i) => (
            <li key={i.id} className="flex items-start gap-2 text-sm">
              {i.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sucesso)]" />
              ) : (
                <AlertTriangle
                  className={`mt-0.5 h-4 w-4 shrink-0 ${i.bloqueante ? "text-destructive" : "text-[var(--aviso)]"}`}
                />
              )}
              <span>
                {i.texto}
                {!i.ok && i.acao && (
                  <span className="block text-xs text-muted-foreground">{i.acao}</span>
                )}
                {!i.ok && !i.bloqueante && (
                  <span className="block text-xs text-[var(--aviso)]">
                    Aviso — não impede o corte.
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>

        <div className="space-y-2">
          <Label htmlFor="frase-corte" className="text-xs">
            Para confirmar, digite <code>{FRASE_DO_CORTE}</code>
          </Label>
          <Input
            id="frase-corte"
            value={frase}
            disabled={!pronto}
            onChange={(e) => setFrase(e.target.value)}
            autoComplete="off"
          />
        </div>

        <Button
          variant="destructive"
          disabled={!pronto || !confirmacaoConfere(frase) || executar.isPending}
          onClick={() => executar.mutate()}
        >
          {executar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Desligar conexão antiga
        </Button>
        {!pronto && (
          <p className="text-xs text-muted-foreground">
            O botão libera quando todos os itens obrigatórios estiverem em ordem.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type SituacaoLida = { phone_number_id: string; status: string | null; erro: string | null };

/** Selo com a situação do número na Meta (ao lado do "Ativo no Leadflow"). */
function SituacaoNaMeta(props: {
  carregando: boolean;
  falhou: boolean;
  lida: SituacaoLida | undefined;
}) {
  if (props.carregando)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Consultando a Meta…
      </span>
    );
  if (props.falhou || !props.lida || props.lida.erro)
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Status da Meta indisponível
      </Badge>
    );
  const sit = situacaoDoNumeroNaMeta(props.lida.status);
  return (
    <Badge
      variant={
        sit.nivel === "erro" ? "destructive" : sit.nivel === "aviso" ? "secondary" : "outline"
      }
      className={
        sit.nivel === "ok"
          ? "border-[var(--sucesso)]/40 text-[var(--sucesso)]"
          : sit.nivel === "aviso"
            ? "bg-[var(--aviso)]/15 text-[var(--aviso)]"
            : undefined
      }
    >
      {sit.rotulo}
    </Badge>
  );
}

/** Explica o que fazer quando a Meta não liberou o número, ou por que não deu para ler. */
function AvisoDaSituacao({ lida }: { lida: SituacaoLida | undefined }) {
  if (!lida) return null;
  if (lida.erro)
    return (
      <p className="rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">
        Não consegui ler o status deste número na Meta: {lida.erro}
      </p>
    );
  const sit = situacaoDoNumeroNaMeta(lida.status);
  if (!sit.dica) return null;
  return (
    <p
      className={
        sit.nivel === "erro"
          ? "rounded-md bg-destructive/10 p-3 text-sm text-destructive"
          : "rounded-md bg-[var(--aviso)]/10 p-3 text-sm"
      }
    >
      {sit.dica}
    </p>
  );
}
