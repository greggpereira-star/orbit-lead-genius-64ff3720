/**
 * Ficha completa do lead, aberta com duplo clique na tabela.
 *
 * A tabela mostra o mínimo pra escanear; tudo que é detalhe vive aqui, sem
 * tirar o usuário da lista. Duas colunas: identidade e ações à esquerda
 * (sempre visíveis), conteúdo em abas à direita.
 */
import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock, Zap, CheckSquare, AlertCircle,
  Mail, Phone, MapPin, Copy, Check, ExternalLink,
  MessageCircle, ClipboardList, Radio, User,
  StickyNote, Plus, Trash2, CalendarClock, Loader2, X, Paperclip, FileText,
  ChevronDown, AlertTriangle, Sparkles, DollarSign, BarChart3, Home, CircleDot,
  PencilLine, MessagesSquare,
  type LucideIcon,
  CircleDollarSign,
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
import { salvarValorDaVenda } from "@/lib/google-ads.functions";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LeadRow } from "../services/leadService";
import { getLeadDisplayName, updateLead, deleteLead, type EditableLeadFields } from "../services/leadService";
import { listStages, moveLeadToStage, type Stage } from "../services/stageService";
import { LossReasonDialog } from "@/modules/crm/components/LossReasonDialog";
import { LossReasonPanel } from "@/modules/crm/components/LossReasonPanel";
import { OwnerPicker } from "@/modules/crm/components/OwnerPicker";
import { LeadJourney } from "@/modules/crm/components/LeadJourney";
import { LeadInsights } from "@/modules/crm/components/LeadInsights";
import { NextActions } from "@/modules/crm/components/NextActions";
import { LeadQuickActions } from "@/modules/crm/components/LeadQuickActions";
import { CartaoFicha, DadoDaFicha, ValorOuVazio } from "@/modules/crm/components/LeadCards";
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

  /* Mesma regra do board: etapa de perda pergunta o motivo antes de gravar.
     Os dois caminhos de escrita precisam concordar, senão trocar a etapa pela
     ficha produziria perda sem motivo — o buraco que este item veio fechar. */
  const [perguntandoMotivo, setPerguntandoMotivo] = useState<Stage | null>(null);

  const mutation = useMutation({
    mutationFn: (v: { stage: Stage; lossReasonId?: string | null; lostNotes?: string | null }) =>
      moveLeadToStage({
        leadId: lead.id,
        stageId: v.stage.id,
        // O modal não conhece a posição na coluna; entra no topo, que é onde
        // um lead recém-mexido faz sentido estar.
        boardOrder: 0,
        fromStageName: current?.name ?? null,
        toStageName: v.stage.name,
        lossReasonId: v.lossReasonId ?? null,
        lostNotes: v.lostNotes ?? null,
        stages,
      }),
    onSuccess: (_, v) => {
      setCurrentId(v.stage.id);
      onChanged(v.stage.id);
      // A lista e o board atrás do modal precisam refletir a mudança na hora.
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Etapa alterada para ${v.stage.name}`);
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
            onClick={() => {
              if (s.id === currentId) return;
              if (s.kind === 'lost') { setPerguntandoMotivo(s); return; }
              mutation.mutate({ stage: s });
            }}
            className="gap-2"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
            {s.id === currentId && <Check className="ml-auto h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>

      {perguntandoMotivo && (
        <LossReasonDialog
          companyId={lead.company_id}
          leadName={lead.name || 'este lead'}
          open
          onConfirm={(motivoId, observacao) => {
            mutation.mutate({ stage: perguntandoMotivo, lossReasonId: motivoId, lostNotes: observacao });
            setPerguntandoMotivo(null);
          }}
          // Aqui nada se moveu ainda — a ficha só grava depois de confirmar —
          // então cancelar não precisa desfazer coisa alguma.
          onCancel={() => setPerguntandoMotivo(null)}
        />
      )}
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
  icon, label, value, copyable, emphasis, action, onSave, placeholder, semRotulo,
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
  /** Dentro de um `DadoDaFicha`, que já imprime o rótulo acima. */
  semRotulo?: boolean;
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
      {icon && <span className="mt-0.5 shrink-0 text-muted-foreground/70">{icon}</span>}
      <div className="min-w-0 flex-1">
        {!semRotulo && (
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
            {label}
          </p>
        )}
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
function NotesTab({
  leadId, companyId, compacto,
}: {
  leadId: string;
  companyId: string;
  /** Na visão geral a lista fica nas três mais recentes. */
  compacto?: boolean;
}) {
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

  const todasAsNotas = notesQuery.data ?? [];
  // Na visão geral cabem três; a aba mostra todas. Cortar aqui, e não só
  // esconder por CSS, evita montar uma lista de cem itens fora de vista.
  const notes = compacto ? todasAsNotas.slice(0, 3) : todasAsNotas;
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


export function LeadDetailDialog({
  lead, open, onOpenChange, originLabel = "Origem", onStatusChange, onLeadUpdated,
}: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("visao-geral");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

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

  /* A ficha precisa saber o TIPO da etapa, não só o nome: "Perdido" é a
     convenção desta empresa, mas o funil é configurável e outra chamaria de
     "Arquivado" ou "Sem resposta". Quem decide é o `kind`. Mesma chave de
     cache do StagePicker, então não vira requisição a mais. */
  const stagesDaFicha = useQuery({
    queryKey: ["stages", lead?.company_id ?? ""],
    queryFn: () => listStages(lead?.company_id ?? ""),
    enabled: Boolean(lead?.company_id) && open,
  });
  const estaPerdido =
    (stagesDaFicha.data ?? []).find(
      (s) => s.id === (lead as { stage_id?: string | null } | null)?.stage_id,
    )?.kind === "lost";

  /* Corrige dado de contato digitado errado na origem — telefone sem o nono
     dígito, e-mail com typo. Antes a ficha era só leitura e não havia como
     arrumar sem ir no banco. */
  /**
   * Valor da venda tem caminho próprio: além de gravar, dispara a conversão
   * no Google Ads quando o lead já está em etapa de ganho. Passar pelo
   * `editMutation` genérico gravaria o número e perderia a conversão.
   */
  const salvarValor = async (texto: string) => {
    const limpo = texto.trim().replace(/[R$\s]/g, '');
    const valor = limpo ? Number(limpo.replace(/\./g, '').replace(',', '.')) : null;
    if (valor !== null && (!Number.isFinite(valor) || valor < 0)) {
      toast.error('Valor inválido', { description: 'Use apenas números, por exemplo 12.500,00' });
      return;
    }
    try {
      const r = await salvarValorDaVenda({ data: { leadId, valor } });
      qc.invalidateQueries({ queryKey: ['lead-detail', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      if (r.conversao === 'enviada') toast.success('Valor salvo e conversão enviada ao Google Ads');
      else if (r.conversao) toast.warning('Valor salvo, conversão não enviada', { description: r.conversao });
      else toast.success('Valor da venda salvo');
    } catch (e) {
      toast.error('Não deu para salvar o valor', {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

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

  /* Compara com o nome BRUTO do banco, não com o exibido: `toTitleCase`
     transforma "MARIA SILVA" em "Maria Silva" só na tela, e comparar com o
     formatado gravaria essa mudança cosmética como se fosse edição. */
  const commitName = () => {
    setEditingName(false);
    const next = nameDraft.trim();
    if (next && next !== (lead.name ?? "").trim()) editMutation.mutate({ name: next });
  };

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
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0 xl:max-w-[80rem]">
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
                {/* O nome também se corrige aqui. Vem em CAIXA ALTA do Meta e
                    às vezes só com o primeiro nome — sem isto, arrumar exigia
                    ir ao banco. `asChild` mantém o DialogTitle como rótulo
                    acessível do modal mesmo virando input. */}
                <DialogTitle asChild>
                  {editingName ? (
                    <Input
                      autoFocus
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onBlur={commitName}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); commitName(); }
                        if (e.key === "Escape") { setNameDraft(name); setEditingName(false); }
                      }}
                      aria-label="Nome do lead"
                      className="h-8 max-w-[22rem] px-1.5 text-lg font-semibold leading-tight"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setNameDraft(name); setEditingName(true); }}
                      title="Clique para editar o nome"
                      className="-mx-1 truncate rounded px-1 text-left text-lg font-semibold leading-tight hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {name}
                    </button>
                  )}
                </DialogTitle>
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
        {/* 300px em vez de 260: a 260 o telefone saía como "+5527996993…" e o
            e-mail como "melquisedec.a…". Truncar o dado que se usa para AGIR é
            o pior corte possível numa ficha de lead — obriga a clicar para ler
            o que deveria estar à vista. */}
        {/* `h-` e não só `max-h-`.
            Com altura apenas máxima, o container cresce pelo conteúdo — e a
            ScrollArea abaixo é `flex-1`, ou seja, base 0 que só ganha tamanho
            do espaço livre do pai. Sem altura definida não existe espaço livre,
            a area de conteudo virava 0px e a aba abria vazia com o modal
            encolhido na altura das abas. */}
        <div className="flex h-[82vh] flex-col overflow-hidden">
          <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
            {/* Seis abas agrupam por pergunta: quem é, como falo, o que quer,
                por onde passou, o que combinei, o que anexei. O layout
                anterior empilhava tudo em três colunas fixas e obrigava a
                rolar duas delas ao mesmo tempo. */}
            <TabsList className="h-auto w-full shrink-0 justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent px-6 pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="visao-geral" className="gap-2"><Home className="h-4 w-4" />Visão geral</TabsTrigger>
              <TabsTrigger value="contato" className="gap-2"><User className="h-4 w-4" />Contato</TabsTrigger>
              <TabsTrigger value="qualificacao" className="gap-2">
                <ClipboardList className="h-4 w-4" />Qualificação
                {answers.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{answers.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="historico" className="gap-2"><Clock className="h-4 w-4" />Histórico</TabsTrigger>
              <TabsTrigger value="anotacoes" className="gap-2">
                <StickyNote className="h-4 w-4" />Anotações
                {noteCount ? (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{noteCount}</Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="arquivos" className="gap-2">
                <Paperclip className="h-4 w-4" />Arquivos e Etiquetas
                {/* A contagem existia na faixa de fatos do layout antigo e se
                    perdeu na reorganização: ficou sendo calculada e nunca
                    exibida. Na aba ela diz se vale abrir antes de abrir. */}
                {attachmentCount ? (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{attachmentCount}</Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="min-h-0 flex-1">
              <TabsContent value="visao-geral" className="m-0 p-6">
  {/* Nove cartões em grade, não três colunas roláveis. Cada um responde uma
      pergunta e termina — quem abre a ficha varre a grade e para no que
      precisa, em vez de rolar três áreas ao mesmo tempo. */}
  <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
    <CartaoFicha
      icone={<User className="h-4 w-4" />}
      titulo="Informações principais"
      acao={
        <Button variant="outline" size="sm" className="h-7" onClick={() => setTab('contato')}>
          Editar
        </Button>
      }
    >
      <div className="divide-y">
        <DadoDaFicha icone={<User className="h-3.5 w-3.5" />} rotulo="Nome">
          <ValorOuVazio valor={name} vazio="Sem nome" />
        </DadoDaFicha>
        <DadoDaFicha
          icone={<Phone className="h-3.5 w-3.5" />}
          rotulo="Telefone"
          acoes={lead.phone ? <CopyButton value={lead.phone} label="Telefone" /> : undefined}
        >
          <ValorOuVazio valor={lead.phone} vazio="Sem telefone" />
        </DadoDaFicha>
        <DadoDaFicha
          icone={<Mail className="h-3.5 w-3.5" />}
          rotulo="E-mail"
          acoes={lead.email ? <CopyButton value={lead.email} label="E-mail" /> : undefined}
        >
          <ValorOuVazio valor={lead.email} vazio="Sem e-mail" />
        </DadoDaFicha>
        <DadoDaFicha icone={<MapPin className="h-3.5 w-3.5" />} rotulo="Cidade (pelo DDD)">
          <ValorOuVazio valor={city ? String(city) : null} vazio="Sem cidade" />
        </DadoDaFicha>
      </div>
    </CartaoFicha>

    <CartaoFicha icone={<BarChart3 className="h-4 w-4" />} titulo="Status no funil">
      <div className="space-y-3">
        <StagePicker lead={lead} onChanged={onStageChanged} />
        {estaPerdido && (
          <LossReasonPanel
            leadId={lead.id}
            companyId={lead.company_id}
            motivoAtualId={lead.loss_reason_id ?? null}
            observacaoAtual={lead.lost_notes ?? null}
          />
        )}
      </div>
    </CartaoFicha>

    <CartaoFicha icone={<Radio className="h-4 w-4" />} titulo="Origem e contexto">
      <div className="divide-y">
        <DadoDaFicha
          icone={<ClipboardList className="h-3.5 w-3.5" />}
          rotulo={originLabel}
          acoes={origin ? <CopyButton value={origin} label={originLabel} /> : undefined}
        >
          <ValorOuVazio valor={origin} vazio="Sem origem" />
        </DadoDaFicha>
        <DadoDaFicha icone={<Radio className="h-3.5 w-3.5" />} rotulo="Canal">
          <ValorOuVazio valor={channelLabel(lead.source ?? lead.utm_source) || null} vazio="Sem canal" />
        </DadoDaFicha>
        <DadoDaFicha icone={<CalendarClock className="h-3.5 w-3.5" />} rotulo="Criado em">
          <span className="block">
            {created}
            {ago && <span className="ml-1 font-normal text-muted-foreground">({ago})</span>}
          </span>
        </DadoDaFicha>
      </div>
    </CartaoFicha>

    <CartaoFicha
      icone={<StickyNote className="h-4 w-4" />}
      titulo="Anotações"
      acao={
        <Button variant="outline" size="sm" className="h-7" onClick={() => setTab('anotacoes')}>
          Ver todas
        </Button>
      }
    >
      <NotesTab leadId={lead.id} companyId={lead.company_id} compacto />
    </CartaoFicha>

    <CartaoFicha
      icone={<Clock className="h-4 w-4" />}
      titulo="Linha do tempo"
      acao={
        <Button variant="outline" size="sm" className="h-7" onClick={() => setTab('historico')}>
          Ver histórico
        </Button>
      }
    >
      <LeadJourney leadId={lead.id} criadoEm={lead.created_at ?? null} compacto semMoldura />
    </CartaoFicha>

    <CartaoFicha icone={<CheckSquare className="h-4 w-4" />} titulo="Próximas ações">
      <NextActions leadId={lead.id} companyId={lead.company_id} semMoldura />
    </CartaoFicha>

    <CartaoFicha
      icone={<Sparkles className="h-4 w-4" />}
      titulo="Resumo do perfil"
      descricao="Montado a partir das respostas do formulário"
      className="xl:col-span-2"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <p className="min-w-0 text-sm leading-relaxed text-muted-foreground">
          {summary || 'Este lead não trouxe respostas de formulário.'}
        </p>
        <CompletenessMeter data={completeness} />
      </div>
    </CartaoFicha>

    <CartaoFicha icone={<Zap className="h-4 w-4" />} titulo="Ações rápidas">
      <LeadQuickActions
        leadId={lead.id}
        companyId={lead.company_id}
        email={lead.email}
        whatsapp={wa}
      />
    </CartaoFicha>

    <div className="xl:col-span-3">
      <LeadInsights lead={lead} />
    </div>
  </div>
</TabsContent>


              <TabsContent value="contato" className="m-0 p-6">
  <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_20rem]">
    <div className="space-y-4">
      {estaPerdido && (
        <CartaoFicha
          icone={<AlertCircle className="h-4 w-4" />}
          titulo="Por que perdeu"
          descricao="Selecione o principal motivo da perda deste lead."
          tom="alerta"
        >
          <LossReasonPanel
            leadId={lead.id}
            companyId={lead.company_id}
            motivoAtualId={lead.loss_reason_id ?? null}
            observacaoAtual={lead.lost_notes ?? null}
            semMoldura
          />
        </CartaoFicha>
      )}

      <CartaoFicha
        icone={<User className="h-4 w-4" />}
        titulo="Contato"
        descricao="Informações de contato e responsável pelo lead."
      >
        <div className="space-y-1">
          <OwnerPicker
            leadId={lead.id}
            companyId={lead.company_id}
            responsavelAtual={lead.assigned_to ?? null}
          />

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
          {/* O atalho do WhatsApp fica junto do telefone porque é o mesmo
              número por outro canal — e é por ele que o time de fato fala. */}
          {wa && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="ml-7 h-8 border-emerald-600/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
            >
              <a href={wa} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-3.5 w-3.5" />
                <span className="ml-1.5">WhatsApp</span>
              </a>
            </Button>
          )}

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
          <Field
            icon={<MapPin className="h-4 w-4" />}
            label="Cidade (pelo DDD)"
            value={city ? String(city) : null}
            placeholder="Sem cidade"
            onSave={(cityName) => editMutation.mutate({ city: cityName })}
          />
        </div>
      </CartaoFicha>
    </div>

    <div className="min-w-0 space-y-4">
      <CartaoFicha
        icone={<Radio className="h-4 w-4" />}
        titulo="Origem e aquisição"
        descricao="Como este lead chegou até você."
      >
        <div className="divide-y">
          <DadoDaFicha
            icone={<ClipboardList className="h-3.5 w-3.5" />}
            rotulo={originLabel}
            acoes={origin ? <CopyButton value={origin} label={originLabel} /> : undefined}
          >
            <ValorOuVazio valor={origin} vazio="Sem origem" />
          </DadoDaFicha>
          <DadoDaFicha icone={<Radio className="h-3.5 w-3.5" />} rotulo="Canal">
            <ValorOuVazio valor={channelLabel(lead.source ?? lead.utm_source) || null} vazio="Sem canal" />
          </DadoDaFicha>
          <DadoDaFicha icone={<CalendarClock className="h-3.5 w-3.5" />} rotulo="Data de criação">
            <span className="block">
              {created}
              {ago && <span className="ml-1 font-normal text-muted-foreground">({ago})</span>}
            </span>
          </DadoDaFicha>
        </div>
      </CartaoFicha>

      <CartaoFicha
        icone={<BarChart3 className="h-4 w-4" />}
        titulo="Resumo do negócio"
        descricao="Informações principais deste lead."
      >
        <div className="divide-y">
          <DadoDaFicha rotulo="Etapa do funil">
            <StagePicker lead={lead} onChanged={onStageChanged} />
          </DadoDaFicha>
          <DadoDaFicha icone={<CircleDollarSign className="h-3.5 w-3.5" />} rotulo="Valor da venda">
            <Field
              icon={null}
              label="Valor da venda"
              value={(() => {
                const l = lead as unknown as { deal_value?: number | string | null; deal_currency?: string };
                return l.deal_value == null ? null : Number(l.deal_value).toLocaleString('pt-BR', {
                  style: 'currency', currency: l.deal_currency ?? 'BRL',
                });
              })()}
              placeholder="Sem valor"
              onSave={(texto) => salvarValor(texto)}
              semRotulo
            />
          </DadoDaFicha>
        </div>
      </CartaoFicha>

      <CartaoFicha
        icone={<Sparkles className="h-4 w-4" />}
        titulo="Resumo do perfil"
        descricao="Montado a partir das respostas do formulário."
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          {summary || 'Este lead não trouxe respostas de formulário. Quando trouxer, o resumo aparece aqui.'}
        </p>
      </CartaoFicha>

      <LeadInsights lead={lead} />
    </div>

    <div className="space-y-4">
      <CartaoFicha
        icone={<BarChart3 className="h-4 w-4" />}
        titulo="Resumo rápido"
        descricao="Quanto do cadastro está preenchido."
      >
        <CompletenessMeter data={completeness} />
      </CartaoFicha>

      <CartaoFicha
        icone={<Clock className="h-4 w-4" />}
        titulo="Última atividade"
        descricao="Último movimento registrado."
        acao={
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setTab('historico')}>
            Ver tudo
          </Button>
        }
      >
        <LeadJourney leadId={lead.id} criadoEm={lead.created_at ?? null} compacto semMoldura limite={1} />
      </CartaoFicha>

      <CartaoFicha
        icone={<StickyNote className="h-4 w-4" />}
        titulo="Última anotação"
        acao={
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setTab('anotacoes')}>
            Abrir
          </Button>
        }
      >
        <NotesTab leadId={lead.id} companyId={lead.company_id} compacto />
      </CartaoFicha>

      <CartaoFicha icone={<CheckSquare className="h-4 w-4" />} titulo="Próximas ações">
        <NextActions leadId={lead.id} companyId={lead.company_id} semMoldura />
      </CartaoFicha>
    </div>
  </div>
</TabsContent>

              <TabsContent value="qualificacao" className="m-0 space-y-4 p-6">
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

                  </TabsContent>

              <TabsContent value="historico" className="m-0 space-y-6 p-6">
  <LeadJourney leadId={lead.id} criadoEm={lead.created_at ?? null} />
<div className="space-y-6">
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
                </div>
</TabsContent>

              <TabsContent value="anotacoes" className="m-0 p-6">
                <div className="mx-auto max-w-2xl">
                  <NotesTab leadId={lead.id} companyId={lead.company_id} />
                </div>
              </TabsContent>

              <TabsContent value="arquivos" className="m-0 space-y-8 p-6">
<div>
                  <AttachmentsTab leadId={lead.id} companyId={lead.company_id} />
                </div>
<div>
                  <TagsTab leadId={lead.id} companyId={lead.company_id} />
                </div>
</TabsContent>
            </ScrollArea>
          </Tabs>
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



