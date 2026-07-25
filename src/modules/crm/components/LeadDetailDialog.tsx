/**
 * Ficha completa do lead, aberta com duplo clique na tabela.
 *
 * A tabela mostra o mínimo pra escanear; tudo que é detalhe vive aqui, sem
 * tirar o usuário da lista. Duas colunas: identidade e ações à esquerda
 * (sempre visíveis), conteúdo em abas à direita.
 */
import { useState } from "react";
import {
  Mail, Phone, MapPin, Calendar, Copy, Check, ExternalLink,
  MessageCircle, Tag as TagIcon, ClipboardList, Radio, User,
} from "lucide-react";
import { toast } from "sonner";

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
              <TabsList className="h-auto w-full justify-start rounded-none border-b bg-transparent px-6 pt-2">
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

                <TabsContent value="tags" className="m-0 p-6">
                  <p className="text-sm text-muted-foreground">
                    Etiquetas e anotações entram na próxima etapa desta tela.
                  </p>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
