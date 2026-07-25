/**
 * Ficha completa do lead, aberta com duplo clique na tabela.
 *
 * A tabela mostra o mínimo pra escanear; tudo que é detalhe vive aqui, sem
 * tirar o usuário da lista. Duas colunas: identidade e ações à esquerda
 * (sempre visíveis), conteúdo em abas à direita.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mail, Phone, MapPin, Calendar, Copy, Check, ExternalLink,
  MessageCircle, Tag as TagIcon, ClipboardList, Radio, User,
  StickyNote, Plus, Trash2, CalendarClock, Loader2, X, Paperclip, FileText,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/core/auth/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  listLeadNotes, createLeadNote, deleteLeadNote, toggleNoteDone,
  listLeadTags, addLeadTag, removeLeadTag, listCompanyTagNames,
} from "../services/leadNotesService";
import {
  listLeadAttachments, uploadLeadAttachment, deleteLeadAttachment,
  getAttachmentUrl, formatFileSize, type LeadAttachment,
} from "../services/leadAttachmentsService";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { LeadRow } from "../services/leadService";
import { getLeadDisplayName } from "../services/leadService";
import {
  getLeadAnswers, getLeadOrigin, getLeadCity, formatDateTime,
  relativeTime, whatsappLink, humanizeKey,
} from "../lib/leadFields";

interface Props {
  lead: LeadRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rótulo configurável: "Empreendimento" numa imobiliária, "Curso" numa escola. */
  originLabel?: string;
}

/** Copiar é a ação mais repetida numa ficha de lead — merece feedback próprio. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
      title={`Copiar ${label}`}
      onClick={() => {
        navigator.clipboard.writeText(value).then(
          () => {
            setCopied(true);
            toast.success(`${label} copiado`);
            setTimeout(() => setCopied(false), 1500);
          },
          () => toast.error("Não foi possível copiar"),
        );
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function Field({
  icon, label, value, copyable,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-medium">{value || "—"}</p>
      </div>
      {copyable && value ? <CopyButton value={value} label={label} /> : null}
    </div>
  );
}

/**
 * Anotações do lead. Uma anotação com data vira compromisso — é o mesmo
 * registro, o que muda é ter prazo. Os compromissos pendentes sobem pro topo
 * porque é neles que o corretor precisa agir.
 */
function NotesTab({ leadId, companyId }: { leadId: string; companyId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");

  const notesQuery = useQuery({
    queryKey: ["lead-notes", leadId],
    queryFn: () => listLeadNotes(leadId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createLeadNote({
        companyId,
        leadId,
        body,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : null,
        authorId: user?.id ?? null,
        authorName: (user as { email?: string } | null)?.email ?? null,
      }),
    onSuccess: () => {
      setBody("");
      setScheduledFor("");
      qc.invalidateQueries({ queryKey: ["lead-notes", leadId] });
      toast.success("Anotação salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doneMutation = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => toggleNoteDone(id, done),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-notes", leadId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLeadNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-notes", leadId] });
      toast.success("Anotação removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const notes = notesQuery.data ?? [];
  const pending = notes.filter((n) => n.scheduled_for && !n.done);
  const rest = notes.filter((n) => !n.scheduled_for || n.done);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

  const renderNote = (n: (typeof notes)[number]) => {
    const overdue = n.scheduled_for && !n.done && new Date(n.scheduled_for) < new Date();
    return (
      <div key={n.id} className="group rounded-lg border p-3.5">
        {n.scheduled_for && (
          <div
            className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${
              n.done ? "text-muted-foreground" : overdue ? "text-destructive" : "text-primary"
            }`}
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {fmt(n.scheduled_for)}
            {n.done ? " · concluído" : overdue ? " · atrasado" : ""}
          </div>
        )}
        <p className={`whitespace-pre-wrap text-sm ${n.done ? "text-muted-foreground line-through" : ""}`}>
          {n.body}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {n.author_name || "—"} · {fmt(n.created_at)}
          </span>
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {n.scheduled_for && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => doneMutation.mutate({ id: n.id, done: !n.done })}
              >
                {n.done ? "Reabrir" : "Concluir"}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => deleteMutation.mutate(n.id)}
              title="Remover anotação"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="O que foi conversado? Ex: cliente pediu proposta do 2 quartos, prefere entrada parcelada."
          className="bg-background text-sm"
          aria-label="Nova anotação"
        />
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="agenda" className="text-xs">
              Agendar retorno ou visita <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              id="agenda"
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="h-9 w-56 bg-background text-sm"
            />
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !body.trim()}
            className="h-9"
          >
            {createMutation.isPending ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="mr-2 h-3.5 w-3.5" />
            )}
            Salvar
          </Button>
        </div>
      </div>

      {notesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma anotação ainda. Registre o que foi negociado para não depender da memória.
        </p>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Compromissos em aberto
              </p>
              {pending.map(renderNote)}
            </div>
          )}
          {rest.length > 0 && (
            <div className="space-y-2">
              {pending.length > 0 && (
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Histórico
                </p>
              )}
              {rest.map(renderNote)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Anexos: proposta, contrato, documento do cliente.
 *
 * O bucket é privado, então o link é assinado no clique e vale poucos minutos.
 * Isso evita que uma proposta com valores vaze por quem receber a URL.
 */
function AttachmentsTab({ leadId, companyId }: { leadId: string; companyId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [opening, setOpening] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["lead-attachments", leadId],
    queryFn: () => listLeadAttachments(leadId),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadLeadAttachment({
        companyId,
        leadId,
        file,
        uploadedBy: user?.id ?? null,
        uploadedByName: (user as { email?: string } | null)?.email ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-attachments", leadId] });
      toast.success("Arquivo anexado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (a: LeadAttachment) => deleteLeadAttachment(a),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-attachments", leadId] });
      toast.success("Anexo removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Abre numa aba nova com URL assinada na hora. */
  const open = async (a: LeadAttachment) => {
    setOpening(a.id);
    try {
      const url = await getAttachmentUrl(a.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir o arquivo.");
    } finally {
      setOpening(null);
    }
  };

  const items = listQuery.data ?? [];

  return (
    <div className="space-y-5">
      <label
        className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/30"
        aria-label="Anexar arquivo"
      >
        <input
          type="file"
          className="sr-only"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
          disabled={uploadMutation.isPending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadMutation.mutate(f);
            // Limpa pra permitir reenviar o mesmo arquivo depois de um erro.
            e.target.value = "";
          }}
        />
        {uploadMutation.isPending ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Paperclip className="h-5 w-5 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">
          {uploadMutation.isPending ? "Enviando…" : "Anexar proposta ou documento"}
        </span>
        <span className="text-xs text-muted-foreground">PDF, imagem, Word ou Excel · até 10 MB</span>
      </label>

      {listQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum arquivo anexado a este lead.</p>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="group flex items-center gap-3 rounded-lg border p-3">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(a.size_bytes)}
                  {a.uploaded_by_name ? ` · ${a.uploaded_by_name}` : ""} ·{" "}
                  {new Date(a.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => open(a)}
                disabled={opening === a.id}
              >
                {opening === a.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                <span className="ml-1.5 hidden sm:inline">Abrir</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                onClick={() => deleteMutation.mutate(a)}
                title={`Remover ${a.file_name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Etiquetas com sugestão das já usadas, pra não virar "Investidor" e "investidor". */
function TagsTab({ leadId, companyId }: { leadId: string; companyId: string }) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");

  const tagsQuery = useQuery({ queryKey: ["lead-tags", leadId], queryFn: () => listLeadTags(leadId) });
  const suggestionsQuery = useQuery({
    queryKey: ["company-tags", companyId],
    queryFn: () => listCompanyTagNames(companyId),
  });

  const addMutation = useMutation({
    mutationFn: (name: string) => addLeadTag(leadId, name),
    onSuccess: () => {
      setInput("");
      qc.invalidateQueries({ queryKey: ["lead-tags", leadId] });
      qc.invalidateQueries({ queryKey: ["company-tags", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeLeadTag(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-tags", leadId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const current = tagsQuery.data ?? [];
  const currentNames = new Set(current.map((t) => t.tag_name));
  const suggestions = (suggestionsQuery.data ?? []).filter((s) => !currentNames.has(s)).slice(0, 12);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && input.trim()) {
              e.preventDefault();
              addMutation.mutate(input);
            }
          }}
          placeholder="Ex: Investidor, Primeira compra, Urgente"
          className="h-9 text-sm"
          aria-label="Nova etiqueta"
        />
        <Button
          onClick={() => addMutation.mutate(input)}
          disabled={addMutation.isPending || !input.trim()}
          className="h-9"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {current.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma etiqueta neste lead.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {current.map((t) => (
            <Badge key={t.id} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1 text-sm">
              {t.tag_name}
              <button
                type="button"
                onClick={() => removeMutation.mutate(t.id)}
                className="rounded-full p-0.5 hover:bg-background"
                title={`Remover ${t.tag_name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Já usadas nesta empresa</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addMutation.mutate(s)}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const TRACKING_FIELDS: { key: keyof LeadRow; label: string }[] = [
  { key: "utm_source" as keyof LeadRow, label: "Origem (utm_source)" },
  { key: "utm_medium" as keyof LeadRow, label: "Mídia (utm_medium)" },
  { key: "utm_campaign" as keyof LeadRow, label: "Campanha (utm_campaign)" },
  { key: "utm_content" as keyof LeadRow, label: "Conteúdo (utm_content)" },
  { key: "utm_term" as keyof LeadRow, label: "Termo (utm_term)" },
  { key: "landing_page" as keyof LeadRow, label: "Página de entrada" },
  { key: "referrer" as keyof LeadRow, label: "Veio de" },
];

export function LeadDetailDialog({ lead, open, onOpenChange, originLabel = "Origem" }: Props) {
  if (!lead) return null;

  const name = getLeadDisplayName(lead);
  const origin = getLeadOrigin(lead);
  const city = getLeadCity(lead);
  const answers = getLeadAnswers(lead);
  const wa = whatsappLink(lead.phone);
  const created = formatDateTime(lead.created_at);
  const ago = relativeTime(lead.created_at);

  const tracking = TRACKING_FIELDS.map((f) => ({
    label: f.label,
    value: (lead as unknown as Record<string, unknown>)[f.key as string],
  })).filter((f) => typeof f.value === "string" && f.value);

  const metaKeys = ["meta_campaign_id", "meta_adset_id", "meta_ad_id", "meta_form_name"];
  const metaInfo = metaKeys
    .map((k) => ({
      label: humanizeKey(k.replace(/^meta_/, "")),
      value: ((lead as { metadata?: Record<string, unknown> }).metadata ?? {})[k],
    }))
    .filter((f) => typeof f.value === "string" && f.value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-0 border-b px-6 py-5">
          <DialogTitle className="text-xl">{name}</DialogTitle>
          <DialogDescription>
            Cadastrado em {created}
            {ago ? ` · ${ago}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] grid-cols-1 md:grid-cols-[300px_1fr]">
          {/* ---------- Identidade e ações ---------- */}
          <aside className="space-y-5 border-b bg-muted/30 p-6 md:border-b-0 md:border-r">
            <div className="space-y-4">
              <Field icon={<Phone className="h-4 w-4" />} label="Telefone" value={lead.phone} copyable />
              <Field icon={<Mail className="h-4 w-4" />} label="E-mail" value={lead.email} copyable />
              <Field
                icon={<MapPin className="h-4 w-4" />}
                label={city?.inferred ? "Cidade (pelo DDD)" : "Cidade"}
                value={city?.label ?? null}
              />
              <Field icon={<ClipboardList className="h-4 w-4" />} label={originLabel} value={origin} />
              <Field
                icon={<User className="h-4 w-4" />}
                label="Responsável"
                value={lead.assigned_to ? `${lead.assigned_to.slice(0, 8)}…` : null}
              />
              <Field icon={<Calendar className="h-4 w-4" />} label="Etapa" value={lead.status ?? null} />
            </div>

            <Separator />

            <div className="space-y-2">
              {wa && (
                <Button asChild className="w-full justify-start" variant="default">
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Abrir no WhatsApp
                  </a>
                </Button>
              )}
              {lead.email && (
                <Button asChild className="w-full justify-start" variant="outline">
                  <a href={`mailto:${lead.email}`}>
                    <Mail className="mr-2 h-4 w-4" />
                    Enviar e-mail
                  </a>
                </Button>
              )}
              <Button asChild className="w-full justify-start" variant="ghost">
                <a href={`/leads/${lead.id}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir página completa
                </a>
              </Button>
            </div>
          </aside>

          {/* ---------- Conteúdo ---------- */}
          <div className="min-w-0">
            <Tabs defaultValue="respostas" className="flex h-full flex-col">
              {/* Com 5 abas o rótulo da última era cortado na largura do modal.
                  Rolagem horizontal resolve em qualquer largura sem abreviar
                  nome de aba, que é o que deixaria a navegação adivinhada. */}
              <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent px-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <TabsTrigger value="respostas" className="gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Respostas
                  {answers.length > 0 && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                      {answers.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="rastreamento" className="gap-2">
                  <Radio className="h-4 w-4" />
                  Rastreamento
                </TabsTrigger>
                <TabsTrigger value="anotacoes" className="gap-2">
                  <StickyNote className="h-4 w-4" />
                  Anotações
                </TabsTrigger>
                <TabsTrigger value="anexos" className="gap-2">
                  <Paperclip className="h-4 w-4" />
                  Anexos
                </TabsTrigger>
                <TabsTrigger value="tags" className="gap-2">
                  <TagIcon className="h-4 w-4" />
                  Etiquetas
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="max-h-[52vh] flex-1">
                <TabsContent value="respostas" className="m-0 p-6">
                  {answers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Este lead não trouxe respostas de formulário.
                    </p>
                  ) : (
                    <dl className="space-y-4">
                      {answers.map((a) => (
                        <div key={a.key} className="rounded-lg border p-3.5">
                          <dt className="text-xs text-muted-foreground">{a.label}</dt>
                          <dd className="mt-0.5 font-medium">{a.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </TabsContent>

                <TabsContent value="rastreamento" className="m-0 space-y-6 p-6">
                  {tracking.length === 0 && metaInfo.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem dados de rastreamento.</p>
                  ) : (
                    <>
                      {tracking.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Campanha
                          </p>
                          <dl className="grid gap-3 sm:grid-cols-2">
                            {tracking.map((t) => (
                              <div key={t.label} className="min-w-0">
                                <dt className="text-xs text-muted-foreground">{t.label}</dt>
                                <dd className="break-words text-sm font-medium">{String(t.value)}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                      {metaInfo.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Meta Lead Ads
                          </p>
                          <dl className="grid gap-3 sm:grid-cols-2">
                            {metaInfo.map((t) => (
                              <div key={t.label} className="min-w-0">
                                <dt className="text-xs text-muted-foreground">{t.label}</dt>
                                <dd className="break-words font-mono text-xs">{String(t.value)}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="anotacoes" className="m-0 p-6">
                  <NotesTab leadId={lead.id} companyId={lead.company_id} />
                </TabsContent>

                <TabsContent value="anexos" className="m-0 p-6">
                  <AttachmentsTab leadId={lead.id} companyId={lead.company_id} />
                </TabsContent>

                <TabsContent value="tags" className="m-0 p-6">
                  <TagsTab leadId={lead.id} companyId={lead.company_id} />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
