/**
 * Ficha completa do lead, aberta com duplo clique na tabela.
 *
 * A tabela mostra o mínimo pra escanear; tudo que é detalhe vive aqui, sem
 * tirar o usuário da lista. Duas colunas: identidade e ações à esquerda
 * (sempre visíveis), conteúdo em abas à direita.
 */
import { useEffect, useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mail, Phone, MapPin, Copy, Check, ExternalLink,
  MessageCircle, Tag as TagIcon, ClipboardList, Radio, User,
  StickyNote, Plus, Trash2, CalendarClock, Loader2, X, Paperclip, FileText,
  ChevronDown, AlertTriangle, Sparkles, DollarSign, BarChart3, Home, CircleDot,
  PencilLine, MessagesSquare,
  type LucideIcon,
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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LeadRow } from "../services/leadService";
import { getLeadDisplayName, updateLead, deleteLead, type EditableLeadFields } from "../services/leadService";
import { listStages, moveLeadToStage, type Stage } from "../services/stageService";
import {
  getLeadAnswers, getLeadOrigin, getLeadCity, formatDateTime,
  relativeTime, whatsappLink, toTitleCase, channelLabel,
  buildProfileSummary, getLeadCompleteness,
  type AnswerKind, type LeadCompleteness,
} from "../lib/leadFields";

interface Props {
  lead: LeadRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rótulo configurável: "Empreendimento" numa imobiliária, "Curso" numa escola. */
  originLabel?: string;
  /**
   * O modal recebe o lead por prop, então mudar a etapa aqui deixaria o objeto
   * do pai desatualizado — reabrir mostraria a etapa antiga até o refetch.
   */
  onStatusChange?: (leadId: string, status: string) => void;
  /** Devolve o lead já salvo pro pai manter a linha da tabela em dia. */
  onLeadUpdated?: (lead: LeadRow) => void;
}

/** Iniciais dão ao modal uma âncora visual — sem elas o topo é só texto. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Cor derivada do nome: o mesmo lead tem sempre a mesma cor, então a lista
 * ganha um ponto de reconhecimento sem precisar de foto.
 */
const AVATAR_TONES = [
  "bg-blue-500/12 text-blue-700 dark:text-blue-300",
  "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  "bg-cyan-500/12 text-cyan-700 dark:text-cyan-300",
];

function avatarTone(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/**
 * Etapa editável na própria pill.
 *
 * Lê as etapas reais da empresa, não uma lista fixa. Antes eram sete rótulos
 * codificados aqui dentro que gravavam `leads.status`, enquanto o pipeline lia
 * `leads.stage_id` — mudar a etapa aqui não mexia o card no board, e vice-versa.
 * Agora as duas telas escrevem pelo mesmo `moveLeadToStage`.
 */
function StagePicker({
  lead, onChanged,
}: {
  lead: LeadRow;
  onChanged: (status: string) => void;
}) {
  const qc = useQueryClient();
  const [currentId, setCurrentId] = useState<string | null>(
    (lead as { stage_id?: string | null }).stage_id ?? null,
  );

  const stagesQuery = useQuery({
    queryKey: ["stages", lead.company_id],
    queryFn: () => listStages(lead.company_id),
    enabled: Boolean(lead.company_id),
  });
  const stages = stagesQuery.data ?? [];
  const current = stages.find((s) => s.id === currentId) ?? null;

  const mutation = useMutation({
    mutationFn: (stage: Stage) =>
      moveLeadToStage({
        leadId: lead.id,
        stageId: stage.id,
        // O modal não conhece a posição na coluna; entra no topo, que é onde
        // um lead recém-mexido faz sentido estar.
        boardOrder: 0,
        fromStageName: current?.name ?? null,
        toStageName: stage.name,
        stages,
      }),
    onSuccess: (_, stage) => {
      setCurrentId(stage.id);
      onChanged(stage.id);
      // A lista e o board atrás do modal precisam refletir a mudança na hora.
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Etapa alterada para ${stage.name}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const label = current?.name ?? "Sem etapa";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={mutation.isPending || stagesQuery.isLoading}
          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          style={
            current
              ? { borderColor: `${current.color}55`, backgroundColor: `${current.color}14`, color: current.color }
              : undefined
          }
          aria-label={`Etapa atual: ${label}. Clique para alterar.`}
        >
          {mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : label}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {stages.map((s) => (
          <DropdownMenuItem
            key={s.id}
            onClick={() => s.id !== currentId && mutation.mutate(s)}
            className="gap-2"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
            {s.id === currentId && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Ícone e cor por assunto da resposta.
 *
 * A cor aqui é semântica, não decorativa: dinheiro em verde, orçamento em
 * violeta, o que se procura em azul, onde em âmbar. Quem usa a tela o dia
 * inteiro passa a achar o orçamento pela cor, sem ler rótulo.
 */
const ANSWER_KIND_STYLE: Record<
  AnswerKind,
  { icon: LucideIcon; tone: string }
> = {
  money: { icon: DollarSign, tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400" },
  budget: { icon: BarChart3, tone: "bg-violet-500/12 text-violet-600 dark:text-violet-400" },
  property: { icon: Home, tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400" },
  place: { icon: MapPin, tone: "bg-amber-500/12 text-amber-600 dark:text-amber-400" },
  time: { icon: CalendarClock, tone: "bg-cyan-500/12 text-cyan-600 dark:text-cyan-400" },
  person: { icon: User, tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400" },
  other: { icon: CircleDot, tone: "bg-muted text-muted-foreground" },
};

/**
 * Quanto se sabe sobre o lead, como anel.
 *
 * Ocupa o lugar onde um "score de potencial" seria natural — e é de propósito
 * que não é um: sem IA nem regra de qualificação cadastrada, um número de
 * potencial seria invenção. Este é conferível campo a campo, e a linha de
 * baixo diz o que perguntar no próximo contato.
 */
function CompletenessMeter({ data }: { data: LeadCompleteness }) {
  const pct = data.total ? data.filled / data.total : 0;
  const R = 26;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="relative h-16 w-16">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r={R} fill="none" strokeWidth="6" className="stroke-muted" />
          <circle
            cx="32" cy="32" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
            className="stroke-primary transition-[stroke-dashoffset] duration-700 ease-out"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
          {data.filled}/{data.total}
        </span>
      </div>
      <div className="space-y-0.5 text-xs">
        <p className="font-medium">Dados do lead</p>
        <p className="text-muted-foreground">
          {data.missing.length === 0 ? "Ficha completa" : `Falta ${data.missing.join(", ")}`}
        </p>
      </div>
    </div>
  );
}

/** Um fato do cadastro na faixa inferior: rótulo pequeno, valor legível. */
function FactItem({
  icon, label, children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-muted-foreground/60" aria-hidden="true">{icon}</span>
      <div className="leading-tight">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium tabular-nums">{children}</p>
      </div>
    </div>
  );
}

/** Agrupa campos com um rótulo pequeno — separa o que é contato do que é
 *  estado interno, que antes vinham na mesma lista achatada. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
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
  icon, label, value, copyable, emphasis, action, onSave, placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  copyable?: boolean;
  /** Telefone é o dado que se usa pra agir; merece mais peso que os demais. */
  emphasis?: boolean;
  /** Atalho direto (ligar, escrever). Substitui o copiar quando existe. */
  action?: { href: string; icon: React.ReactNode; title: string };
  /** Presente = campo editável no clique. Ausente = só leitura. */
  onSave?: (next: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== (value ?? "").trim()) onSave?.(draft);
  };

  const textClass = emphasis
    ? "text-[15px] font-semibold tabular-nums tracking-tight"
    : "text-sm font-medium";

  return (
    <div className="group/field flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-muted-foreground/70">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
          {label}
        </p>
        {editing ? (
          /* Salva ao sair do campo e no Enter; Esc descarta. Mesmo gesto do
             seletor de etapa, que o usuário já conhece — sem modal, sem botão
             de salvar pra um campo só. */
          <Input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); }
            }}
            placeholder={placeholder}
            aria-label={label}
            className={`h-7 px-1.5 py-0 ${textClass}`}
          />
        ) : onSave ? (
          <button
            type="button"
            onClick={() => { setDraft(value ?? ""); setEditing(true); }}
            title={value ? `${value} — clique para editar` : "Clique para preencher"}
            className={`-mx-1 block w-full truncate rounded px-1 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${textClass} ${
              value ? "" : "text-muted-foreground"
            }`}
          >
            {value || placeholder || "—"}
          </button>
        ) : (
          /* truncate + title em vez de quebrar no meio: um e-mail longo virava
             "…gmail.c / om" na coluna estreita, o que parece defeito. */
          <p className={`truncate ${textClass}`} title={value || undefined}>
            {value || "—"}
          </p>
        )}
      </div>
      {/* Visível sempre, não só no hover: num toque não existe hover, e o
          botão de ligar era inalcançável no celular. */}
      {action && value ? (
        <Button
          asChild
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          title={action.title}
        >
          <a href={action.href}>
            {action.icon}
            <span className="sr-only">{action.title}</span>
          </a>
        </Button>
      ) : copyable && value ? (
        <CopyButton value={value} label={label} />
      ) : null}
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
  const [expanded, setExpanded] = useState(false);
  // O NotesTab aparece duas vezes no modal (aba em telas estreitas, coluna
  // fixa em telas largas). Um id fixo duplicaria e o <label> apontaria pro
  // campo errado.
  const agendaId = useId();

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
      setExpanded(false);
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
      {/* Compositor cresce só quando em uso: numa coluna fixa e estreita, um
          formulário sempre aberto empurraria o histórico pra fora da vista. */}
      <div className="space-y-2.5 rounded-xl border bg-background p-3 transition-colors focus-within:border-primary/40">
        <div className="flex items-start gap-2">
          <PencilLine
            className="mt-2 h-4 w-4 shrink-0 text-muted-foreground/50"
            aria-hidden="true"
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onFocus={() => setExpanded(true)}
            rows={expanded ? 3 : 1}
            placeholder="Adicionar uma anotação…"
            className="resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0"
            aria-label="Nova anotação"
          />
        </div>
        {expanded && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={agendaId} className="text-xs text-muted-foreground">
                Agendar retorno ou visita (opcional)
              </Label>
              <Input
                id={agendaId}
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="h-9 w-full bg-background text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !body.trim()}
                size="sm"
                className="h-8 flex-1"
              >
                {createMutation.isPending ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-3.5 w-3.5" />
                )}
                Salvar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => {
                  setBody("");
                  setScheduledFor("");
                  setExpanded(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </>
        )}
      </div>

      {notesQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : notes.length === 0 ? (
        /* Estado vazio com peso: numa coluna alta, uma frase solta no topo
           deixava o resto da coluna parecendo conteúdo que falhou ao
           carregar. Centrado e com ícone, lê-se como "ainda não há", que é
           o que de fato é. */
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <MessagesSquare className="h-8 w-8 text-muted-foreground/35" aria-hidden="true" />
          <p className="text-sm font-medium">Nenhuma anotação ainda.</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Registre o que foi conversado para não depender da memória.
          </p>
        </div>
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

/**
 * As anotações moram na coluna fixa quando há largura pra ela e viram aba
 * quando não há. Precisa ser decisão em JS, não `xl:hidden`: com CSS, o
 * NotesTab existiria duas vezes no DOM e — pior — quem estivesse na aba
 * "Anotações" e alargasse a janela veria o painel central em branco, porque a
 * aba continuava selecionada mas seu conteúdo sumia.
 */
const WIDE_QUERY = "(min-width: 1280px)";

function useIsWide(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

export function LeadDetailDialog({
  lead, open, onOpenChange, originLabel = "Origem", onStatusChange, onLeadUpdated,
}: Props) {
  const isWide = useIsWide();
  const qc = useQueryClient();
  const [tab, setTab] = useState("respostas");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Alargou a janela com "Anotações" aberta: a aba deixa de existir, então
  // devolve o foco pra primeira em vez de deixar o painel vazio.
  useEffect(() => {
    if (isWide && tab === "anotacoes") setTab("respostas");
  }, [isWide, tab]);

  /* Contagens da faixa de fatos. Mesmas chaves das abas, então o React Query
     serve as duas do mesmo cache — abrir o modal não dispara requisição a
     mais. `enabled` mantém a ordem dos hooks estável mesmo sem lead. */
  const leadId = lead?.id ?? "";
  const notesCountQuery = useQuery({
    queryKey: ["lead-notes", leadId],
    queryFn: () => listLeadNotes(leadId),
    enabled: Boolean(lead) && open,
  });
  const attachmentsCountQuery = useQuery({
    queryKey: ["lead-attachments", leadId],
    queryFn: () => listLeadAttachments(leadId),
    enabled: Boolean(lead) && open,
  });
  const noteCount = notesCountQuery.data?.length ?? null;
  const attachmentCount = attachmentsCountQuery.data?.length ?? null;

  /* Corrige dado de contato digitado errado na origem — telefone sem o nono
     dígito, e-mail com typo. Antes a ficha era só leitura e não havia como
     arrumar sem ir no banco. */
  const editMutation = useMutation({
    mutationFn: (patch: Partial<EditableLeadFields>) =>
      updateLead({ leadId: leadId, companyId: lead?.company_id ?? '', patch }),
    onSuccess: (updated) => {
      // A tabela e o board mostram os mesmos campos; precisam acompanhar.
      qc.invalidateQueries({ queryKey: ['leads'] });
      onLeadUpdated?.(updated);
      toast.success('Dado atualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLead({ leadId, companyId: lead?.company_id ?? '' }),
    onSuccess: () => {
      setConfirmDelete(false);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead excluído');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!lead) return null;

  const onStageChanged = (status: string) => onStatusChange?.(lead.id, status);

  const name = toTitleCase(getLeadDisplayName(lead)) || getLeadDisplayName(lead);
  const origin = getLeadOrigin(lead);
  const city = getLeadCity(lead);
  const answers = getLeadAnswers(lead);
  const wa = whatsappLink(lead.phone);
  const created = formatDateTime(lead.created_at);
  const ago = relativeTime(lead.created_at);
  const summary = buildProfileSummary(answers);
  const completeness = getLeadCompleteness(lead, answers);

  const rawMeta = (lead as { metadata?: Record<string, unknown> }).metadata ?? {};

  const tracking = TRACKING_FIELDS.map((f) => {
    const key = f.key as string;
    let value = (lead as unknown as Record<string, unknown>)[key];

    /* Leads antigos guardaram o ID numérico em utm_campaign, porque a coleta
       de nomes estava quebrada. Não reescrevi o dado histórico, mas exibir
       "52525417339565" aqui enquanto a seção do Meta logo abaixo mostra o nome
       da mesma campanha é contradição na mesma tela. */
    if (key === "utm_campaign" && typeof value === "string" && /^\d{6,}$/.test(value)) {
      value = (rawMeta.meta_campaign_name as string) ?? value;
    }

    return { label: f.label, value };
  }).filter((f) => typeof f.value === "string" && f.value);

  const meta = (lead as { metadata?: Record<string, unknown> }).metadata ?? {};

  /* Mostra o NOME quando existe e cai pro id só como último recurso: a ficha
     exibia "52525417339565", que não diz a ninguém qual anúncio trouxe o lead. */
  const metaInfo = [
    { label: "Campanha", value: meta.meta_campaign_name ?? meta.meta_campaign_id },
    { label: "Conjunto", value: meta.meta_adset_name ?? meta.meta_adset_id },
    { label: "Anúncio", value: meta.meta_ad_name ?? meta.meta_ad_id },
    { label: "Formulário", value: meta.meta_form_name },
  ].filter((f) => typeof f.value === "string" && f.value);

  const duplicateSince = typeof meta.duplicate_first_seen_at === "string"
    ? meta.duplicate_first_seen_at
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 xl:max-w-6xl">
        {/* Cabeçalho: identidade + etapa + a ação principal, tudo na primeira
            linha de leitura. Antes o topo era só o nome e uma data, e a ação
            mais usada (WhatsApp) ficava enterrada abaixo de seis campos. */}
        <DialogHeader className="space-y-0 border-b px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarTone(name)}`}
                aria-hidden="true"
              >
                {initials(name)}
              </span>
              <div className="min-w-0 space-y-1">
                <DialogTitle className="truncate text-lg leading-tight">{name}</DialogTitle>
                {/* asChild: o DialogDescription vira <div>, senão o botão do
                    seletor ficaria dentro de um <p> — HTML inválido. */}
                <DialogDescription asChild>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <StagePicker lead={lead} onChanged={onStageChanged} />
                    <span className="text-muted-foreground/50">·</span>
                    <span>{created}</span>
                    {ago && <span className="text-muted-foreground/70">({ago})</span>}
                  </div>
                </DialogDescription>
              </div>
            </div>

            {/* WhatsApp é a ação real sobre um lead novo; e-mail e página
                completa são secundárias, então viram ícones. */}
            <div className="flex shrink-0 items-center gap-1.5 pr-8">
              {lead.email && (
                <Button asChild variant="ghost" size="icon" className="h-9 w-9" title="Enviar e-mail">
                  <a href={`mailto:${lead.email}`}>
                    <Mail className="h-4 w-4" />
                  </a>
                </Button>
              )}
              <Button asChild variant="ghost" size="icon" className="h-9 w-9" title="Abrir página completa">
                <a href={`/leads/${lead.id}`}>
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
              {/* Excluir mora aqui, e não no card do pipeline: a ficha abre dos
                  dois lugares, então um comando só cobre a tabela e o board sem
                  encher o card de botão. */}
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                title="Excluir lead"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Excluir lead</span>
              </Button>
              {wa && (
                <Button asChild size="sm" className="h-9">
                  <a href={wa} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" />
                    WhatsApp
                  </a>
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Contato repetido: sem isso o corretor liga pra mesma pessoa duas
            vezes como se fossem leads diferentes. Não fundimos os cadastros —
            cada um traz respostas próprias, e um pode ser de outro
            empreendimento — mas o aviso precisa estar visível antes da ligação. */}
        {duplicateSince && (
          <div className="flex items-center gap-2.5 border-b border-amber-500/25 bg-amber-500/8 px-6 py-2.5 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Este contato já havia se cadastrado em{" "}
              <strong>{formatDateTime(duplicateSince)}</strong>. Confira o histórico antes de ligar.
            </span>
          </div>
        )}

        {/* Três colunas: contexto | dados do lead | trabalho.
            As anotações saíram da aba porque ali eram consulta, não ferramenta
            — o corretor precisa registrar o que combinou COM os dados à vista,
            não depois de trocar de aba e perder a resposta de orçamento. */}
        {/* No celular as colunas viram uma pilha e quem rola é o modal inteiro.
            Com cada coluna rolando sozinha, o painel de contato ganhava uma
            faixa de ~150px e cortava o telefone no meio do número. */}
        <div className="grid max-h-[78vh] grid-cols-1 overflow-y-auto md:grid-cols-[260px_1fr] md:overflow-y-hidden xl:grid-cols-[260px_1fr_330px]">
          {/* ---------- Contexto ----------
              Antes era uma lista achatada de seis campos onde telefone
              (acionável) tinha o mesmo peso de etapa (estado interno). Agora
              vem agrupado por natureza da informação. */}
          <aside className="space-y-6 border-b bg-muted/20 p-6 md:overflow-y-auto md:border-b-0 md:border-r">
            <Section title="Contato">
              <Field
                icon={<Phone className="h-4 w-4" />}
                label="Telefone"
                value={lead.phone}
                emphasis
                placeholder="Sem telefone"
                onSave={(phone) => editMutation.mutate({ phone })}
                action={lead.phone ? {
                  href: `tel:${lead.phone.replace(/[^\d+]/g, "")}`,
                  icon: <Phone className="h-3.5 w-3.5" />,
                  title: "Ligar",
                } : undefined}
              />
              <Field
                icon={<Mail className="h-4 w-4" />}
                label="E-mail"
                value={lead.email}
                placeholder="Sem e-mail"
                onSave={(email) => editMutation.mutate({ email })}
                action={lead.email ? {
                  href: `mailto:${lead.email}`,
                  icon: <Mail className="h-3.5 w-3.5" />,
                  title: "Enviar e-mail",
                } : undefined}
              />
              {/* Editar cidade grava no campo de verdade e a partir daí ele
                  vence a dedução pelo DDD — que continua valendo pra quem
                  nunca preencheu. */}
              <Field
                icon={<MapPin className="h-4 w-4" />}
                label={city?.inferred ? "Cidade (pelo DDD)" : "Cidade"}
                value={city?.label ?? null}
                placeholder="Sem cidade"
                onSave={(cityName) => editMutation.mutate({ city: cityName })}
              />
            </Section>

            <Separator />

            <Section title="Captação">
              <Field icon={<ClipboardList className="h-4 w-4" />} label={originLabel} value={origin} copyable />
              <Field
                icon={<Radio className="h-4 w-4" />}
                label="Canal"
                value={channelLabel(lead.source ?? lead.utm_source) || null}
              />
            </Section>

            <Separator />

            <Section title="Atendimento">
              {/* Lead sem responsável é pendência, não campo vazio — antes
                  aparecia como um travessão igual a qualquer dado ausente. */}
              {lead.assigned_to ? (
                <Field
                  icon={<User className="h-4 w-4" />}
                  label="Responsável"
                  value={`${lead.assigned_to.slice(0, 8)}…`}
                />
              ) : (
                <div className="flex items-start gap-3">
                  <User className="mt-0.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Responsável</p>
                    <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      Ninguém atribuído
                    </p>
                  </div>
                </div>
              )}
            </Section>
          </aside>

          {/* ---------- Conteúdo ---------- */}
          <div className="min-w-0">
            <Tabs value={tab} onValueChange={setTab} className="flex h-full flex-col">
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
                {/* Em telas estreitas não há espaço pra coluna fixa, então as
                    anotações voltam a ser aba — só aí. */}
                {!isWide && (
                  <TabsTrigger value="anotacoes" className="gap-2">
                    <StickyNote className="h-4 w-4" />
                    Anotações
                  </TabsTrigger>
                )}
                <TabsTrigger value="anexos" className="gap-2">
                  <Paperclip className="h-4 w-4" />
                  Anexos
                </TabsTrigger>
                <TabsTrigger value="tags" className="gap-2">
                  <TagIcon className="h-4 w-4" />
                  Etiquetas
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 md:max-h-[62vh]">
                <TabsContent value="respostas" className="m-0 space-y-4 p-6">
                  {answers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Este lead não trouxe respostas de formulário.
                    </p>
                  ) : (
                    <>
                      {/* Estas respostas são o motivo de ligar pra esta pessoa:
                          orçamento, tipo de imóvel, prioridade. O ícone dá a
                          cada cartão um assunto reconhecível de relance — sem
                          ele, quatro cartões cinzas iguais obrigam a ler os
                          quatro rótulos pra achar o orçamento. */}
                      <dl className="grid gap-3 sm:grid-cols-2">
                        {answers.map((a) => {
                          const k = ANSWER_KIND_STYLE[a.kind];
                          const Icon = k.icon;
                          return (
                            <div
                              key={a.key}
                              className="rounded-xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-primary/30"
                            >
                              <span
                                className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${k.tone}`}
                                aria-hidden="true"
                              >
                                <Icon className="h-[18px] w-[18px]" />
                              </span>
                              <dt
                                className="text-[11px] font-medium uppercase leading-tight tracking-wide text-muted-foreground"
                                title={a.label}
                              >
                                {a.short}
                              </dt>
                              <dd className="mt-1 text-[15px] font-semibold leading-snug tracking-tight">
                                {a.value}
                              </dd>
                            </div>
                          );
                        })}
                      </dl>

                      {summary && (
                        <div className="rounded-xl border bg-primary/[0.04] p-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 space-y-1.5">
                              <p className="flex items-center gap-2 text-sm font-semibold text-primary">
                                <Sparkles className="h-4 w-4" />
                                Resumo do perfil
                              </p>
                              {/* Montado por template a partir das respostas
                                  acima — não há IA no projeto e uma frase
                                  "gerada" que ninguém pode auditar seria pior
                                  que não ter resumo nenhum. */}
                              <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
                            </div>
                            <CompletenessMeter data={completeness} />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Fatos verificáveis sobre o cadastro. Antes o "há 1h" só
                      existia no topo, então quem rolava as respostas perdia a
                      noção de quão quente o contato ainda está. */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-muted/25 px-4 py-3">
                    <FactItem icon={<CalendarClock className="h-4 w-4" />} label="Primeiro contato">
                      {created}
                      {ago && <span className="ml-1 font-normal text-muted-foreground">({ago})</span>}
                    </FactItem>
                    <FactItem icon={<StickyNote className="h-4 w-4" />} label="Anotações">
                      {noteCount === null ? "—" : noteCount}
                    </FactItem>
                    <FactItem icon={<Paperclip className="h-4 w-4" />} label="Anexos">
                      {attachmentCount === null ? "—" : attachmentCount}
                    </FactItem>
                  </div>
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

                {!isWide && (
                  <TabsContent value="anotacoes" className="m-0 p-6">
                    <NotesTab leadId={lead.id} companyId={lead.company_id} />
                  </TabsContent>
                )}

                <TabsContent value="anexos" className="m-0 p-6">
                  <AttachmentsTab leadId={lead.id} companyId={lead.company_id} />
                </TabsContent>

                <TabsContent value="tags" className="m-0 p-6">
                  <TagsTab leadId={lead.id} companyId={lead.company_id} />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>

          {/* ---------- Anotações (coluna fixa) ---------- */}
          {isWide && (
            <aside className="flex flex-col border-l bg-muted/20">
              <div className="flex items-center gap-2 border-b px-5 py-3.5">
                <StickyNote className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold tracking-tight">Anotações</h3>
              </div>
              <ScrollArea className="flex-1 md:max-h-[62vh]">
                <div className="p-5">
                  <NotesTab leadId={lead.id} companyId={lead.company_id} />
                </div>
              </ScrollArea>
            </aside>
          )}
        </div>
      </DialogContent>

      {/* Nomear quem vai sumir: "Excluir este lead?" some no automático de
          quem clica rápido, e aqui não há desfazer. */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Some junto tudo que está preso a este lead: anotações, anexos,
              etiquetas, histórico e mensagens de WhatsApp. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); deleteMutation.mutate(); }}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
