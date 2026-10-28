/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RotateCw,
  Send,
  Trash2,
  Webhook,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  atualizarEndpointDeWebhook,
  criarChaveDeApi,
  criarEndpointDeWebhook,
  enviarTesteDeWebhook,
  entregasDoEndpoint,
  estadoDeDesenvolvedor,
  removerEndpointDeWebhook,
  revogarChaveDeApi,
  rotacionarSegredoDeWebhook,
  type ChaveListada,
  type EndpointListado,
} from "@/lib/desenvolvedores.functions";
import {
  ESCOPOS,
  EVENTOS_DE_WEBHOOK,
  ROTULO_DO_ESCOPO,
  ROTULO_DO_EVENTO,
  type Escopo,
  type EventoDeWebhook,
} from "@/lib/apiPublica/escopos";

export const Route = createFileRoute("/_app/settings/desenvolvedores")({
  head: () => ({ meta: [{ title: "API e webhooks — Configurações" }] }),
  component: DesenvolvedoresPage,
});

const data = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success("Copiado.");
  } catch {
    toast.error("Não consegui copiar. Selecione o texto e copie manualmente.");
  }
}

function DesenvolvedoresPage() {
  const qc = useQueryClient();
  const buscar = useServerFn(estadoDeDesenvolvedor);
  const estado = useQuery({ queryKey: ["desenvolvedor"], queryFn: () => buscar() });
  const recarregar = () => qc.invalidateQueries({ queryKey: ["desenvolvedor"] });

  if (estado.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  const e = estado.data;
  if (!e)
    return <p className="py-8 text-sm text-muted-foreground">Não foi possível carregar agora.</p>;
  if (!e.podeConfigurar) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API e webhooks</CardTitle>
          <CardDescription>
            Apenas dono ou administrador da empresa pode gerenciar chaves de API e webhooks.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <SecaoDeChaves incluida={e.apiIncluida} chaves={e.chaves} aoMudar={recarregar} />
      <SecaoDeWebhooks
        incluido={e.webhooksIncluidos}
        endpoints={e.endpoints}
        aoMudar={recarregar}
      />
    </div>
  );
}

function Bloqueado({ frase }: { frase: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-dashed p-4 text-sm">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-medium">{frase}</p>
        <p className="text-muted-foreground">
          Veja o que cada plano traz em{" "}
          <Link to={"/settings/plano" as any} className="underline">
            Plano e recursos
          </Link>{" "}
          ou fale com a ALT para liberar.
        </p>
      </div>
    </div>
  );
}

/** Mostra um segredo uma única vez. Fechar a janela é irreversível, e o texto diz isso. */
function SegredoUnico({
  titulo,
  valor,
  aoFechar,
}: {
  titulo: string;
  valor: string | null;
  aoFechar: () => void;
}) {
  return (
    <Dialog open={!!valor} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            Copie agora e guarde em um lugar seguro. Por segurança,{" "}
            <strong>não será possível ver este valor de novo</strong> — se perder, gere outro.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">
            {valor}
          </code>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Copiar"
            onClick={() => valor && copiar(valor)}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={aoFechar}>Já guardei</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Chaves ---------------------------------------------------------------

function SecaoDeChaves({
  incluida,
  chaves,
  aoMudar,
}: {
  incluida: boolean;
  chaves: ChaveListada[];
  aoMudar: () => void;
}) {
  const criar = useServerFn(criarChaveDeApi);
  const revogar = useServerFn(revogarChaveDeApi);
  const [abrir, setAbrir] = useState(false);
  const [nome, setNome] = useState("");
  const [escopos, setEscopos] = useState<Escopo[]>(["leads:read"]);
  const [validade, setValidade] = useState("nunca");
  const [novaChave, setNovaChave] = useState<string | null>(null);
  const [aRevogar, setARevogar] = useState<ChaveListada | null>(null);

  const criacao = useMutation({
    mutationFn: () =>
      criar({
        data: { nome, escopos, expiraEmDias: validade === "nunca" ? null : Number(validade) },
      }),
    onSuccess: (r) => {
      setAbrir(false);
      setNome("");
      setEscopos(["leads:read"]);
      setValidade("nunca");
      setNovaChave(r.chave);
      aoMudar();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const revogacao = useMutation({
    mutationFn: (id: string) => revogar({ data: { id } }),
    onSuccess: () => {
      toast.success("Chave revogada. Ela deixou de funcionar agora.");
      setARevogar(null);
      aoMudar();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const base =
    typeof window !== "undefined" ? `${window.location.origin}/api/public/v1` : "/api/public/v1";
  const exemplo = `curl ${base}/leads?limit=10 \\\n  -H "Authorization: Bearer SUA_CHAVE"`;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Chaves de API
            </CardTitle>
            <CardDescription>
              Permitem que outro sistema leia e crie leads da sua empresa. Cada chave tem escopos
              próprios e pode ser revogada a qualquer momento.
            </CardDescription>
          </div>
          {incluida && (
            <Button size="sm" onClick={() => setAbrir(true)}>
              <Plus className="mr-1 h-4 w-4" /> Nova chave
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!incluida ? (
          <Bloqueado frase="A API pública não está incluída no plano da sua empresa." />
        ) : (
          <>
            {chaves.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma chave criada ainda.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {chaves.map((c) => {
                  const vencida = c.expiraEm && Date.parse(c.expiraEm) <= Date.now();
                  const inativa = !!c.revogadaEm || !!vencida;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                      <div className="min-w-[14rem] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`font-medium ${inativa ? "text-muted-foreground line-through" : ""}`}
                          >
                            {c.nome}
                          </span>
                          {c.revogadaEm && <Badge variant="destructive">Revogada</Badge>}
                          {!c.revogadaEm && vencida && <Badge variant="secondary">Vencida</Badge>}
                          {c.escopos.map((s) => (
                            <Badge key={s} variant="outline">
                              {ROTULO_DO_ESCOPO[s as Escopo] ?? s}
                            </Badge>
                          ))}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          <code>{c.prefixo}…</code> · criada em {data(c.criadaEm)} · último uso:{" "}
                          {data(c.ultimoUsoEm)}
                          {c.expiraEm && !c.revogadaEm && ` · expira em ${data(c.expiraEm)}`}
                        </div>
                      </div>
                      {!inativa && (
                        <Button variant="ghost" size="sm" onClick={() => setARevogar(c)}>
                          <Trash2 className="mr-1 h-4 w-4" /> Revogar
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="rounded-md bg-muted/50 p-3">
              <div className="mb-1 flex items-center justify-between text-xs font-medium">
                Exemplo de uso
                <Button type="button" variant="ghost" size="sm" onClick={() => copiar(exemplo)}>
                  <Copy className="mr-1 h-3 w-3" /> Copiar
                </Button>
              </div>
              <pre className="overflow-x-auto text-xs">{exemplo}</pre>
              <p className="mt-2 text-xs text-muted-foreground">
                Endpoints: <code>GET /leads</code>, <code>POST /leads</code>,{" "}
                <code>GET /leads/:id</code>, <code>PATCH /leads/:id</code>, <code>GET /stages</code>
                . Limite de 120 requisições por minuto por chave. Use o cabeçalho{" "}
                <code>Idempotency-Key</code> ao criar leads para poder repetir a chamada sem
                duplicar.
              </p>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={abrir} onOpenChange={setAbrir}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova chave de API</DialogTitle>
            <DialogDescription>
              Dê um nome que diga quem vai usar (ex.: "Integração do site").
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="chave-nome">Nome</Label>
              <Input
                id="chave-nome"
                value={nome}
                maxLength={80}
                onChange={(ev) => setNome(ev.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>O que esta chave pode fazer</Label>
              {ESCOPOS.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={escopos.includes(s)}
                    onCheckedChange={(v) =>
                      setEscopos((atual) =>
                        v ? [...new Set([...atual, s])] : atual.filter((x) => x !== s),
                      )
                    }
                  />
                  {ROTULO_DO_ESCOPO[s]}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                Dê só o necessário: quem só envia leads não precisa ler a base.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Validade</Label>
              <Select value={validade} onValueChange={setValidade}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nunca">Não expira</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                  <SelectItem value="365">1 ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbrir(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!nome.trim() || escopos.length === 0 || criacao.isPending}
              onClick={() => criacao.mutate()}
            >
              {criacao.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar chave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SegredoUnico
        titulo="Sua chave de API"
        valor={novaChave}
        aoFechar={() => setNovaChave(null)}
      />

      <AlertDialog open={!!aRevogar} onOpenChange={(v) => !v && setARevogar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar a chave "{aRevogar?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Qualquer sistema que use esta chave deixa de funcionar imediatamente. Não dá para
              desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => aRevogar && revogacao.mutate(aRevogar.id)}>
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// --- Webhooks -------------------------------------------------------------

function SecaoDeWebhooks({
  incluido,
  endpoints,
  aoMudar,
}: {
  incluido: boolean;
  endpoints: EndpointListado[];
  aoMudar: () => void;
}) {
  const criar = useServerFn(criarEndpointDeWebhook);
  const [abrir, setAbrir] = useState(false);
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [eventos, setEventos] = useState<EventoDeWebhook[]>([...EVENTOS_DE_WEBHOOK]);
  const [segredo, setSegredo] = useState<string | null>(null);

  const criacao = useMutation({
    mutationFn: () => criar({ data: { nome, url, eventos } }),
    onSuccess: (r) => {
      setAbrir(false);
      setNome("");
      setUrl("");
      setEventos([...EVENTOS_DE_WEBHOOK]);
      setSegredo(r.segredo);
      aoMudar();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-4 w-4" /> Webhooks de saída
            </CardTitle>
            <CardDescription>
              Avisam outro sistema, em tempo real, quando um lead é criado ou muda de etapa. Cada
              envio é assinado para você confirmar a origem.
            </CardDescription>
          </div>
          {incluido && (
            <Button size="sm" onClick={() => setAbrir(true)}>
              <Plus className="mr-1 h-4 w-4" /> Novo destino
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!incluido ? (
          <Bloqueado frase="Os webhooks assinados não estão incluídos no plano da sua empresa." />
        ) : (
          <>
            {endpoints.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum destino cadastrado.</p>
            ) : (
              <ul className="space-y-3">
                {endpoints.map((ep) => (
                  <Destino key={ep.id} ep={ep} aoMudar={aoMudar} />
                ))}
              </ul>
            )}
            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Como conferir a assinatura</p>
              <p>
                Cada envio traz <code>X-Leadflow-Signature: t=&lt;segundos&gt;,v1=&lt;hex&gt;</code>
                , onde <code>v1</code> é o HMAC-SHA256 de <code>"&lt;t&gt;.&lt;corpo cru&gt;"</code>{" "}
                com o segredo do destino. Recuse se <code>t</code> estiver a mais de 5 minutos de
                agora. O mesmo evento pode chegar mais de uma vez: use o campo <code>id</code> para
                ignorar repetições. Responda com status 2xx em até 8 segundos; falhas são tentadas
                de novo (até 6 vezes, com espera crescente).
              </p>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={abrir} onOpenChange={setAbrir}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo destino de webhook</DialogTitle>
            <DialogDescription>
              A URL precisa ser https e acessível pela internet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wh-nome">Nome</Label>
              <Input
                id="wh-nome"
                value={nome}
                maxLength={80}
                onChange={(ev) => setNome(ev.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">URL</Label>
              <Input
                id="wh-url"
                type="url"
                placeholder="https://seu-sistema.com/webhooks/leadflow"
                value={url}
                onChange={(ev) => setUrl(ev.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Eventos</Label>
              {EVENTOS_DE_WEBHOOK.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={eventos.includes(ev)}
                    onCheckedChange={(v) =>
                      setEventos((atual) =>
                        v ? [...new Set([...atual, ev])] : atual.filter((x) => x !== ev),
                      )
                    }
                  />
                  {ROTULO_DO_EVENTO[ev]} <code className="text-xs text-muted-foreground">{ev}</code>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbrir(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!nome.trim() || !url.trim() || eventos.length === 0 || criacao.isPending}
              onClick={() => criacao.mutate()}
            >
              {criacao.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar destino
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SegredoUnico
        titulo="Segredo de assinatura"
        valor={segredo}
        aoFechar={() => setSegredo(null)}
      />
    </Card>
  );
}

function Destino({ ep, aoMudar }: { ep: EndpointListado; aoMudar: () => void }) {
  const atualizar = useServerFn(atualizarEndpointDeWebhook);
  const remover = useServerFn(removerEndpointDeWebhook);
  const rotacionar = useServerFn(rotacionarSegredoDeWebhook);
  const testar = useServerFn(enviarTesteDeWebhook);
  const listar = useServerFn(entregasDoEndpoint);
  const [aberto, setAberto] = useState(false);
  const [confirmar, setConfirmar] = useState<"remover" | "rotacionar" | null>(null);
  const [novoSegredo, setNovoSegredo] = useState<string | null>(null);

  const entregas = useQuery({
    queryKey: ["entregas-webhook", ep.id],
    queryFn: () => listar({ data: { id: ep.id } }),
    enabled: aberto,
    refetchInterval: aberto ? 15_000 : false,
  });

  const alternar = useMutation({
    mutationFn: () => atualizar({ data: { id: ep.id, ativo: !ep.ativo } }),
    onSuccess: aoMudar,
    onError: (err: Error) => toast.error(err.message),
  });
  const teste = useMutation({
    mutationFn: () => testar({ data: { id: ep.id } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Teste entregue (HTTP ${r.status}).`);
      else
        toast.error(
          `Teste falhou: ${r.erro ?? "sem detalhe"}${r.status ? ` (HTTP ${r.status})` : ""}.`,
        );
      void entregas.refetch();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const exclusao = useMutation({
    mutationFn: () => remover({ data: { id: ep.id } }),
    onSuccess: () => {
      setConfirmar(null);
      aoMudar();
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const troca = useMutation({
    mutationFn: () => rotacionar({ data: { id: ep.id } }),
    onSuccess: (r) => {
      setConfirmar(null);
      setNovoSegredo(r.segredo);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <li className="rounded-md border">
      <div className="flex flex-col gap-3 p-3 text-sm">
        <div className="flex items-start gap-3">
          <button
            type="button"
            className="mt-0.5 text-muted-foreground"
            aria-label={aberto ? "Ocultar entregas" : "Ver entregas"}
            onClick={() => setAberto((v) => !v)}
          >
            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{ep.nome}</span>
              {ep.ativo ? (
                <Badge variant="secondary">Ativo</Badge>
              ) : (
                <Badge variant="destructive">Desativado</Badge>
              )}
              {ep.eventos.map((ev) => (
                <Badge key={ev} variant="outline">
                  {ROTULO_DO_EVENTO[ev as EventoDeWebhook] ?? ev}
                </Badge>
              ))}
            </div>
            <div className="mt-0.5 break-all text-xs text-muted-foreground">
              {ep.url} · última entrega: {data(ep.ultimaEntregaEm)}
            </div>
            {!ep.ativo && ep.desativadoMotivo && (
              <div className="mt-0.5 text-xs text-destructive">{ep.desativadoMotivo}</div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 pl-7">
          <Button
            variant="outline"
            size="sm"
            disabled={teste.isPending || !ep.ativo}
            onClick={() => teste.mutate()}
          >
            {teste.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-1 h-4 w-4" />
            )}{" "}
            Testar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={alternar.isPending}
            onClick={() => alternar.mutate()}
          >
            {ep.ativo ? "Desativar" : "Reativar"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmar("rotacionar")}>
            <RotateCw className="mr-1 h-4 w-4" /> Novo segredo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmar("remover")}
            aria-label="Remover destino"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {aberto && (
        <div className="border-t bg-muted/30 p-3">
          {entregas.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (entregas.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma entrega ainda. Os eventos aparecem aqui assim que acontecerem.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Quando</th>
                  <th className="py-1 pr-3 font-medium">Evento</th>
                  <th className="py-1 pr-3 font-medium">Situação</th>
                  <th className="py-1 font-medium">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {(entregas.data ?? []).map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="py-1 pr-3 whitespace-nowrap">{data(d.criadaEm)}</td>
                    <td className="py-1 pr-3">{d.evento}</td>
                    <td className="py-1 pr-3">
                      {d.status === "done" && (
                        <span className="inline-flex items-center gap-1">
                          <Check className="h-3 w-3" /> Entregue
                        </span>
                      )}
                      {d.status === "pending" &&
                        (d.tentativas > 0
                          ? `Nova tentativa ${data(d.proximaTentativaEm)}`
                          : "Na fila")}
                      {d.status === "running" && "Enviando…"}
                      {d.status === "failed" && <span className="text-destructive">Falhou</span>}
                    </td>
                    <td className="py-1 text-muted-foreground">
                      {d.ultimoStatus ? `HTTP ${d.ultimoStatus}` : ""} {d.ultimoErro ?? ""}{" "}
                      {d.tentativas > 1 ? `(${d.tentativas} tentativas)` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <SegredoUnico
        titulo="Novo segredo de assinatura"
        valor={novoSegredo}
        aoFechar={() => setNovoSegredo(null)}
      />

      <AlertDialog open={confirmar !== null} onOpenChange={(v) => !v && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar === "remover"
                ? `Remover "${ep.nome}"?`
                : `Gerar novo segredo para "${ep.nome}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar === "remover"
                ? "O destino deixa de receber eventos e o histórico de entregas dele é apagado. Não dá para desfazer."
                : "O segredo atual deixa de valer agora. Atualize o seu sistema com o novo valor, ou as próximas entregas serão recusadas por ele."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => (confirmar === "remover" ? exclusao.mutate() : troca.mutate())}
            >
              {confirmar === "remover" ? "Remover" : "Gerar novo segredo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
