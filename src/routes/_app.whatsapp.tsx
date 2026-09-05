/**
 * WhatsApp — conexão do número e automações de primeiro contato.
 *
 * Substitui o mockup estático que existia aqui (caixa de entrada falsa, com
 * conversas fictícias e nenhuma ligação com dados reais). A caixa de entrada
 * de verdade depende de receber mensagens, que é a Fase 2; esta tela entrega
 * o que de fato funciona: parear o número, configurar as duas mensagens
 * automáticas e auditar os envios.
 */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, Smartphone, QrCode, PowerOff, Send, CheckCircle2,
  AlertCircle, MessageSquare, RefreshCw, Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  getWhatsAppStatus,
  connectWhatsApp,
  refreshWhatsAppQr,
  disconnectWhatsApp,
  saveWhatsAppSettings,
  sendWhatsAppTest,
} from "@/lib/whatsapp.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface SettingsForm {
  greeting_enabled: boolean;
  greeting_template: string;
  broker_alert_enabled: boolean;
  broker_alert_phone: string;
  broker_alert_template: string;
  quiet_hours_start: number;
  quiet_hours_end: number;
  min_interval_seconds: number;
}

const STATUS_LABEL: Record<string, string> = {
  sent: "Enviada",
  failed: "Falhou",
  skipped: "Não enviada",
  pending: "Enviando",
  received: "Recebida",
};

const KIND_LABEL: Record<string, string> = {
  greeting: "Saudação ao lead",
  broker_alert: "Alerta ao corretor",
  manual: "Teste",
  reply: "Resposta",
};

/**
 * Os campos de proteção eram três caixas com "8", "21" e "8" e o rótulo
 * "Intervalo entre envios (s)". Nada ali dizia se era hora, dia ou minuto —
 * o usuário tinha que adivinhar. Agora a unidade aparece dentro do próprio
 * controle e um resumo em texto repete a configuração por extenso.
 */
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: h,
  label: `${String(h).padStart(2, "0")}:00`,
}));

const INTERVAL_OPTIONS = [
  { value: 0, label: "Sem espera" },
  { value: 5, label: "5 segundos" },
  { value: 8, label: "8 segundos" },
  { value: 15, label: "15 segundos" },
  { value: 30, label: "30 segundos" },
  { value: 60, label: "1 minuto" },
  { value: 120, label: "2 minutos" },
  { value: 300, label: "5 minutos" },
];

function intervalLabel(seconds: number): string {
  const known = INTERVAL_OPTIONS.find((o) => o.value === seconds);
  if (known) return known.label;
  if (seconds < 60) return `${seconds} segundos`;
  const min = Math.round(seconds / 60);
  return min === 1 ? "1 minuto" : `${min} minutos`;
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function WhatsAppPage() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getWhatsAppStatus);
  const connect = useServerFn(connectWhatsApp);
  const refreshQr = useServerFn(refreshWhatsAppQr);
  const disconnect = useServerFn(disconnectWhatsApp);
  const saveSettings = useServerFn(saveWhatsAppSettings);
  const sendTest = useServerFn(sendWhatsAppTest);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [form, setForm] = useState<SettingsForm | null>(null);

  const statusQuery = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: () => fetchStatus(),
    // Enquanto o QR está na tela, o pareamento acontece no celular do usuário:
    // só descobrimos que conectou perguntando de novo.
    refetchInterval: qrOpen ? 3000 : false,
  });

  const data = statusQuery.data;
  const connected = data?.instance?.status === "connected";

  useEffect(() => {
    if (data?.settings && !form) {
      const s = data.settings as any;
      setForm({
        greeting_enabled: s.greeting_enabled ?? false,
        greeting_template: s.greeting_template ?? "",
        broker_alert_enabled: s.broker_alert_enabled ?? false,
        broker_alert_phone: s.broker_alert_phone ?? "",
        broker_alert_template: s.broker_alert_template ?? "",
        quiet_hours_start: s.quiet_hours_start ?? 8,
        quiet_hours_end: s.quiet_hours_end ?? 21,
        min_interval_seconds: s.min_interval_seconds ?? 8,
      });
    }
  }, [data?.settings, form]);

  // Fecha o QR sozinho quando o pareamento conclui — o usuário está olhando
  // pro celular, não pra tela.
  useEffect(() => {
    if (qrOpen && connected) {
      setQrOpen(false);
      setQrImage(null);
      toast.success("WhatsApp conectado!");
    }
  }, [qrOpen, connected]);

  const connectMutation = useMutation({
    mutationFn: () => connect(),
    onSuccess: (res) => {
      setQrImage(res.qrCodeBase64);
      setQrOpen(true);
      qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const refreshQrMutation = useMutation({
    mutationFn: () => refreshQr(),
    onSuccess: (res) => setQrImage(res.qrCodeBase64),
    onError: (err: Error) => toast.error(err.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: () => {
      toast.success("Número desconectado");
      qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const saveMutation = useMutation({
    mutationFn: (input: SettingsForm) =>
      saveSettings({
        data: { ...input, broker_alert_phone: input.broker_alert_phone.trim() || null },
      }),
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testMutation = useMutation({
    mutationFn: () => sendTest({ data: { phone: testPhone } }),
    onSuccess: () => {
      toast.success("Mensagem de teste enviada");
      qc.invalidateQueries({ queryKey: ["whatsapp-status"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const update = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  if (statusQuery.isLoading) {
    return (
      <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl mx-auto">
      <div className="space-y-1.5">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">WhatsApp</h1>
        <p className="text-muted-foreground text-sm md:text-base">
          Conecte um número e responda cada lead novo automaticamente, em segundos.
        </p>
      </div>

      {/* "Configurado" e "alcançável" são coisas diferentes: antes a tela dizia
          que estava tudo certo só porque as variáveis existiam, e o erro só
          aparecia ao clicar em conectar. */}
      {!data?.configured ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            O servidor ainda não tem as variáveis <code className="font-mono">EVOLUTION_API_URL</code> e{" "}
            <code className="font-mono">EVOLUTION_API_KEY</code> configuradas. Sem elas, nenhuma mensagem é enviada.
          </p>
        </div>
      ) : !data?.reachable ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium">Servidor de WhatsApp fora do ar</p>
            <p className="text-muted-foreground">
              {data?.healthError ?? "Não foi possível alcançar a Evolution API."}
            </p>
            <p className="text-muted-foreground">
              Conectar um número não vai funcionar enquanto isso não for resolvido.
            </p>
          </div>
        </div>
      ) : null}

      {/* A última falha de conexão, vinda do banco. O motivo antes vivia só no
          toast e sumia ao trocar de tela — quem fosse investigar depois não
          tinha por onde começar. */}
      {data?.instance?.last_error ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium">A última tentativa de conectar falhou</p>
            <p className="text-muted-foreground">{data.instance.last_error}</p>
          </div>
        </div>
      ) : null}

      {/* ---------------- Conexão ---------------- */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  connected
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Smartphone className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <CardTitle className="text-base">
                  {connected ? "Número conectado" : "Nenhum número conectado"}
                </CardTitle>
                <CardDescription>
                  {connected
                    ? data?.instance?.phone_number
                      ? `Enviando pelo número ${data.instance.phone_number}.`
                      : "Pronto para enviar mensagens automáticas."
                    : "Pareie um número pelo QR code para ativar as automações."}
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {connected ? (
                <>
                  <Badge className="bg-emerald-500 hover:bg-emerald-600">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Conectado
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PowerOff className="mr-2 h-3.5 w-3.5" />
                    )}
                    Desconectar
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => connectMutation.mutate()}
                  disabled={connectMutation.isPending || !data?.configured || !data?.reachable}
                  title={!data?.reachable ? "Servidor de WhatsApp indisponível" : undefined}
                >
                  {connectMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <QrCode className="mr-2 h-4 w-4" />
                  )}
                  Conectar número
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {connected && (
          <CardContent className="border-t pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[220px] space-y-1.5">
                <Label htmlFor="test-phone" className="text-xs">
                  Enviar uma mensagem de teste
                </Label>
                <Input
                  id="test-phone"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="27 99999-8888"
                  className="h-9"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || testPhone.trim().length < 8}
                className="h-9"
              >
                {testMutation.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-2 h-3.5 w-3.5" />
                )}
                Enviar teste
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ---------------- Automações ---------------- */}
      {form && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Mensagens automáticas</CardTitle>
            <CardDescription>
              Disparadas assim que um lead entra — pelo Meta Lead Ads ou por um quiz.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Saudação */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="greeting-toggle" className="cursor-pointer font-medium">
                    Saudação para o lead
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    O lead recebe uma mensagem sua assim que se cadastra.
                  </p>
                </div>
                <Switch
                  id="greeting-toggle"
                  checked={form.greeting_enabled}
                  onCheckedChange={(v) => update("greeting_enabled", v)}
                />
              </div>
              {form.greeting_enabled && (
                <Textarea
                  value={form.greeting_template}
                  onChange={(e) => update("greeting_template", e.target.value)}
                  rows={3}
                  className="text-sm"
                  aria-label="Texto da saudação"
                />
              )}
            </div>

            {/* Alerta ao corretor */}
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="broker-toggle" className="cursor-pointer font-medium">
                    Alerta para o corretor
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    O corretor recebe os dados do lead e um link que já abre a conversa.
                  </p>
                </div>
                <Switch
                  id="broker-toggle"
                  checked={form.broker_alert_enabled}
                  onCheckedChange={(v) => update("broker_alert_enabled", v)}
                />
              </div>
              {form.broker_alert_enabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="broker-phone" className="text-xs">
                      WhatsApp do corretor
                    </Label>
                    <Input
                      id="broker-phone"
                      value={form.broker_alert_phone}
                      onChange={(e) => update("broker_alert_phone", e.target.value)}
                      placeholder="27 99999-8888"
                      className="h-9 max-w-xs"
                    />
                  </div>
                  <Textarea
                    value={form.broker_alert_template}
                    onChange={(e) => update("broker_alert_template", e.target.value)}
                    rows={4}
                    className="text-sm"
                    aria-label="Texto do alerta ao corretor"
                  />
                </div>
              )}
            </div>

            {(form.greeting_enabled || form.broker_alert_enabled) && (
              <div className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  Variáveis disponíveis: <code className="font-mono">{"{{nome}}"}</code>,{" "}
                  <code className="font-mono">{"{{nome_completo}}"}</code>,{" "}
                  <code className="font-mono">{"{{telefone}}"}</code>,{" "}
                  <code className="font-mono">{"{{campanha}}"}</code>,{" "}
                  <code className="font-mono">{"{{origem}}"}</code> e, no alerta,{" "}
                  <code className="font-mono">{"{{link}}"}</code>.
                </p>
              </div>
            )}

            {/* Proteções */}
            <div className="space-y-4 rounded-lg border p-4">
              <div className="space-y-1">
                <p className="font-medium">Proteção do número</p>
                <p className="text-sm text-muted-foreground">
                  Mandar mensagem de madrugada, ou várias de uma vez, faz o WhatsApp desconfiar do
                  número e ele pode ser bloqueado. Os limites abaixo evitam isso.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Só enviar neste horário</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={String(form.quiet_hours_start)}
                    onValueChange={(v) => update("quiet_hours_start", Number(v))}
                  >
                    <SelectTrigger className="h-9 w-28" aria-label="Horário de início dos envios">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOUR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">às</span>
                  <Select
                    value={String(form.quiet_hours_end)}
                    onValueChange={(v) => update("quiet_hours_end", Number(v))}
                  >
                    <SelectTrigger className="h-9 w-28" aria-label="Horário de término dos envios">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOUR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">(horário de Brasília)</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Esperar entre uma mensagem e outra</Label>
                <Select
                  value={String(form.min_interval_seconds)}
                  onValueChange={(v) => update("min_interval_seconds", Number(v))}
                >
                  <SelectTrigger className="h-9 w-44" aria-label="Tempo de espera entre mensagens">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Repete a configuração por extenso: o usuário confere lendo uma
                  frase, sem precisar interpretar campo por campo. */}
              <p className="rounded-md bg-muted/60 px-3 py-2.5 text-sm">
                {form.quiet_hours_start === form.quiet_hours_end ? (
                  <>Enviando a qualquer hora do dia</>
                ) : form.quiet_hours_start < form.quiet_hours_end ? (
                  <>
                    Enviando das <strong>{hourLabel(form.quiet_hours_start)}</strong> às{" "}
                    <strong>{hourLabel(form.quiet_hours_end)}</strong>
                  </>
                ) : (
                  <>
                    Enviando das <strong>{hourLabel(form.quiet_hours_start)}</strong> até as{" "}
                    <strong>{hourLabel(form.quiet_hours_end)}</strong> do dia seguinte
                  </>
                )}
                {form.min_interval_seconds > 0 ? (
                  <>
                    , com <strong>{intervalLabel(form.min_interval_seconds)}</strong> de espera entre
                    cada mensagem.
                  </>
                ) : (
                  <>, sem espera entre as mensagens.</>
                )}{" "}
                Lead que chegar fora desse horário não recebe a saudação — o cadastro dele é
                registrado normalmente.
              </p>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => form && saveMutation.mutate(form)}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar configurações
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------------- Log ---------------- */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            Últimos envios
          </CardTitle>
          <CardDescription>
            Inclui o que não foi enviado e o motivo — útil pra entender silêncio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.messages?.length ? (
            <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
          ) : (
            <div className="divide-y">
              {data.messages.map((m: any) => (
                <div key={m.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{KIND_LABEL[m.kind] ?? m.kind}</span>
                      <span className="font-mono text-xs text-muted-foreground">{m.to_phone}</span>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {m.body || m.skipped_reason || m.error_message || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <Badge
                      variant={
                        m.status === "sent" ? "default" : m.status === "failed" ? "destructive" : "secondary"
                      }
                      className={m.status === "sent" ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                    >
                      {STATUS_LABEL[m.status] ?? m.status}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(m.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------- QR ---------------- */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {qrImage ? (
              <img
                src={qrImage.startsWith("data:") ? qrImage : `data:image/png;base64,${qrImage}`}
                alt="QR code para parear o WhatsApp"
                className="h-64 w-64 rounded-lg border bg-white p-2"
              />
            ) : (
              <div className="flex h-64 w-64 items-center justify-center rounded-lg border">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            <p className="text-center text-xs text-muted-foreground">
              O código expira em segundos. Se falhar, gere outro.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshQrMutation.mutate()}
              disabled={refreshQrMutation.isPending}
            >
              {refreshQrMutation.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
              )}
              Gerar novo código
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_app/whatsapp")({
  component: WhatsAppPage,
});
