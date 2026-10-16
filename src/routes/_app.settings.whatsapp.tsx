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
import { Textarea } from "@/components/ui/textarea";
import {
  apagarRascunhoTemplateWhatsApp,
  apagarTemplateWhatsApp,
  concluirSignupWhatsApp,
  criarTemplateWhatsApp,
  obterEstadoDoWhatsAppOficial,
  salvarRascunhoTemplateWhatsApp,
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
import {
  temErro,
  validarTemplate,
  variaveisDe,
  type BotaoDeTemplate,
  type DefinicaoDeTemplate,
} from "@/lib/whatsapp/cloud/templates";
import { envolverSelecao, inserirVariavel, previaDoTemplate } from "@/lib/whatsapp/cloud/previa";
import { PreviaDoTemplate } from "@/modules/atendimento/components/PreviaDoTemplate";
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
    mutationFn: () => sincronizar(),
    onSuccess: (r) => {
      toast.success(`${r.total} template(s) sincronizado(s).`);
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: (nome: string) => apagar({ data: { nome } }),
    onSuccess: () => {
      toast.success("Template apagado.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [criando, setCriando] = useState(false);
  /** Rascunho aberto no editor (null = template novo). */
  const [rascunho, setRascunho] = useState<{ id: string; def: DefinicaoDeTemplate } | null>(null);
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
                </div>
              )}

              {numeros.map((n) => (
                <div key={n.phone_number_id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium tabular-nums">+{n.display_phone}</div>
                    <div className="flex gap-2">
                      <Badge variant={n.status === "active" ? "default" : "destructive"}>
                        {n.status === "active" ? "Ativo" : "Desconectado"}
                      </Badge>
                      <Badge variant="secondary">
                        {n.mode === "coexistence" ? "Coexistência" : "Somente API"}
                      </Badge>
                    </div>
                  </div>

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
              <div className="flex gap-2">
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
              {d.templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum template ainda.</p>
              ) : (
                <ul className="divide-y">
                  {d.templates.map((t) => (
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
          <UsoDoMes />
          <CorteDaEvolution />
        </>
      )}

      <NovoTemplate
        key={rascunho?.id ?? "novo"}
        aberto={criando}
        inicial={rascunho}
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

const DEFINICAO_VAZIA: DefinicaoDeTemplate = {
  nome: "",
  idioma: "pt_BR",
  categoria: "UTILITY",
  cabecalho: "",
  corpo: "",
  rodape: "",
  botoes: [],
  exemplosDoCorpo: [],
};

function NovoTemplate({
  aberto,
  inicial,
  onFechar,
  onCriado,
}: {
  aberto: boolean;
  inicial: { id: string; def: DefinicaoDeTemplate } | null;
  onFechar: () => void;
  onCriado: () => void;
}) {
  const criar = useServerFn(criarTemplateWhatsApp);
  const salvarRascunho = useServerFn(salvarRascunhoTemplateWhatsApp);
  const [def, setDef] = useState<DefinicaoDeTemplate>(inicial?.def ?? DEFINICAO_VAZIA);
  // Id do rascunho em edição: o primeiro "Salvar rascunho" o cria, os seguintes atualizam.
  const [rascunhoId, setRascunhoId] = useState<string | null>(inicial?.id ?? null);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function guardarRascunho() {
    setSalvando(true);
    try {
      const r = await salvarRascunho({
        data: { ...(rascunhoId ? { id: rascunhoId } : {}), definicao: def },
      });
      setRascunhoId(r.id);
      toast.success("Rascunho salvo.");
      onCriado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o rascunho.");
    } finally {
      setSalvando(false);
    }
  }
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  /** Aplica a barra de ferramentas ao corpo, mantendo seleção e cursor. */
  function aplicarNoCorpo(
    f: (texto: string, ini: number, fim: number) => { texto: string; cursor: [number, number] },
  ) {
    const el = corpoRef.current;
    const ini = el?.selectionStart ?? def.corpo.length;
    const fim = el?.selectionEnd ?? def.corpo.length;
    const r = f(def.corpo, ini, fim);
    setDef((x) => ({ ...x, corpo: r.texto }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.cursor[0], r.cursor[1]);
    });
  }

  // A MESMA validação do servidor, em tempo real: o autor erra na tela, e não
  // depois de esperar a revisão da Meta.
  const problemas = validarTemplate(def);
  const nVars = new Set(variaveisDe(def.corpo)).size;

  async function enviar() {
    setEnviando(true);
    try {
      const r = await criar({ data: { ...def, ...(rascunhoId ? { rascunhoId } : {}) } });
      if (!r.ok) {
        toast.error(r.texto);
        return;
      }
      toast.success(
        r.status === "APPROVED" ? "Template aprovado." : "Template enviado para análise da Meta.",
      );
      setDef(DEFINICAO_VAZIA);
      setRascunhoId(null);
      onCriado();
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o template.");
    } finally {
      setEnviando(false);
    }
  }

  const setBotao = (i: number, b: Partial<BotaoDeTemplate>) =>
    setDef((x) => ({
      ...x,
      botoes: (x.botoes ?? []).map((o, j) => (j === i ? { ...o, ...b } : o)),
    }));

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo template</DialogTitle>
          <DialogDescription>
            A Meta analisa o template antes de liberá-lo. Isso costuma levar minutos.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="t-nome">Nome</Label>
                <Input
                  id="t-nome"
                  value={def.nome}
                  placeholder="boas_vindas_v1"
                  onChange={(e) => setDef({ ...def, nome: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="t-cat">Categoria</Label>
                <select
                  id="t-cat"
                  className="w-full border rounded-md px-2 py-2 text-sm bg-background"
                  value={def.categoria}
                  onChange={(e) =>
                    setDef({
                      ...def,
                      categoria: e.target.value as DefinicaoDeTemplate["categoria"],
                    })
                  }
                >
                  <option value="UTILITY">Utilidade (acompanhamento, confirmação)</option>
                  <option value="MARKETING">Marketing (oferta, promoção)</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-cab">Cabeçalho (opcional)</Label>
              <Input
                id="t-cab"
                maxLength={60}
                value={def.cabecalho ?? ""}
                onChange={(e) => setDef({ ...def, cabecalho: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{(def.cabecalho ?? "").length}/60</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="t-corpo">Mensagem</Label>
              <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Formatação">
                {[
                  { rotulo: "Negrito", marca: "*", ico: "B", cls: "font-bold" },
                  { rotulo: "Itálico", marca: "_", ico: "I", cls: "italic" },
                  { rotulo: "Tachado", marca: "~", ico: "S", cls: "line-through" },
                  { rotulo: "Monoespaçado", marca: "```", ico: "</>", cls: "font-mono" },
                ].map((f) => (
                  <Button
                    key={f.marca}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`h-7 w-8 px-0 ${f.cls}`}
                    aria-label={f.rotulo}
                    title={f.rotulo}
                    onClick={() => aplicarNoCorpo((t, a, b) => envolverSelecao(t, a, b, f.marca))}
                  >
                    {f.ico}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    aplicarNoCorpo((t, a, b) => {
                      const r = inserirVariavel(t, a, b);
                      return { texto: r.texto, cursor: [r.cursor, r.cursor] };
                    })
                  }
                >
                  <Plus className="h-3 w-3 mr-1" /> Variável
                </Button>
              </div>
              <Textarea
                id="t-corpo"
                ref={corpoRef}
                rows={5}
                value={def.corpo}
                placeholder="Olá {{1}}, recebemos seu pedido {{2}}."
                onChange={(e) => setDef({ ...def, corpo: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{1}}"}, {"{{2}}"}… para valores que mudam. {def.corpo.length}/1024
              </p>
            </div>

            {nVars > 0 && (
              <div className="space-y-2">
                <Label>Exemplos das variáveis (a Meta exige)</Label>
                {Array.from({ length: nVars }, (_, i) => (
                  <Input
                    key={i}
                    placeholder={`Exemplo de {{${i + 1}}}`}
                    value={def.exemplosDoCorpo?.[i] ?? ""}
                    onChange={(e) => {
                      const ex = [...(def.exemplosDoCorpo ?? [])];
                      ex[i] = e.target.value;
                      setDef({ ...def, exemplosDoCorpo: ex });
                    }}
                  />
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="t-rod">Rodapé (opcional)</Label>
              <Input
                id="t-rod"
                maxLength={60}
                value={def.rodape ?? ""}
                onChange={(e) => setDef({ ...def, rodape: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">{(def.rodape ?? "").length}/60</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Botões (opcional)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={(def.botoes?.length ?? 0) >= 3}
                  onClick={() =>
                    setDef({
                      ...def,
                      botoes: [...(def.botoes ?? []), { tipo: "QUICK_REPLY", texto: "" }],
                    })
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Botão
                </Button>
              </div>
              {(def.botoes ?? []).map((b, i) => (
                <div key={i} className="grid grid-cols-[130px_1fr_1fr_auto] gap-2 items-center">
                  <select
                    className="border rounded-md px-2 py-2 text-sm bg-background"
                    aria-label={`Tipo do botão ${i + 1}`}
                    value={b.tipo}
                    onChange={(e) =>
                      setBotao(i, { tipo: e.target.value as BotaoDeTemplate["tipo"] })
                    }
                  >
                    <option value="QUICK_REPLY">Resposta</option>
                    <option value="URL">Link</option>
                    <option value="PHONE_NUMBER">Ligar</option>
                  </select>
                  <Input
                    aria-label={`Texto do botão ${i + 1}`}
                    placeholder="Texto"
                    value={b.texto}
                    onChange={(e) => setBotao(i, { texto: e.target.value })}
                  />
                  <Input
                    aria-label={`Valor do botão ${i + 1}`}
                    placeholder={
                      b.tipo === "URL" ? "https://…" : b.tipo === "PHONE_NUMBER" ? "+5527…" : "—"
                    }
                    disabled={b.tipo === "QUICK_REPLY"}
                    value={b.valor ?? ""}
                    onChange={(e) => setBotao(i, { valor: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover botão ${i + 1}`}
                    onClick={() =>
                      setDef({ ...def, botoes: (def.botoes ?? []).filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {problemas.length > 0 && def.nome + def.corpo !== "" && (
              <ul className="space-y-1" aria-live="polite">
                {problemas.map((p, i) => (
                  <li
                    key={i}
                    className={`text-sm flex gap-2 ${p.gravidade === "erro" ? "text-destructive" : "text-[var(--aviso)]"}`}
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    {p.texto}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <aside className="md:sticky md:top-0 self-start space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Pré-visualização</p>
            <PreviaDoTemplate previa={previaDoTemplate(def)} />
            <p className="text-[11px] text-muted-foreground">
              Aproximação de como a mensagem aparece. Os exemplos das variáveis entram no lugar de{" "}
              {"{{n}}"}.
            </p>
          </aside>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          <Button variant="secondary" disabled={salvando || enviando} onClick={guardarRascunho}>
            {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar rascunho
          </Button>
          <Button disabled={enviando || temErro(problemas) || def.nome === ""} onClick={enviar}>
            {enviando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar para análise
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
