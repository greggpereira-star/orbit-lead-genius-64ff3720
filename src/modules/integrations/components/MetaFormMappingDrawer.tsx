import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save, Trash2, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import {
  saveMetaFormMapping,
  deleteMetaFormMapping,
  listMetaMappingOptions,
} from "@/lib/meta-forms.functions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

export interface MetaFormForMapping {
  form_id: string;
  form_name: string | null;
  page_id: string;
  page_name: string | null;
  mapping: {
    id?: string;
    is_active?: boolean;
    stage_id?: string | null;
    assigned_to?: string | null;
    default_tags?: string[];
    default_score?: number;
    default_temperature?: "cold" | "warm" | "hot" | null;
    default_utm_source?: string | null;
    default_utm_medium?: string | null;
    default_utm_campaign?: string | null;
    external_crm_enabled?: boolean;
    external_crm_provider?: string | null;
    external_crm_config?: Record<string, unknown>;
  } | null;
}

interface Props {
  open: boolean;
  form: MetaFormForMapping | null;
  onOpenChange: (v: boolean) => void;
}

const NONE = "__none__";

export function MetaFormMappingDrawer({ open, form, onOpenChange }: Props) {
  const qc = useQueryClient();
  const save = useServerFn(saveMetaFormMapping);
  const remove = useServerFn(deleteMetaFormMapping);
  const loadOptions = useServerFn(listMetaMappingOptions);

  const options = useQuery({
    queryKey: ["meta-mapping-options"],
    queryFn: () => loadOptions(),
    staleTime: 60_000,
    enabled: open,
  });

  const m = form?.mapping ?? null;
  const [isActive, setIsActive] = useState(true);
  const [stageId, setStageId] = useState<string>(NONE);
  const [assignedTo, setAssignedTo] = useState<string>(NONE);
  const [tags, setTags] = useState("");
  const [score, setScore] = useState<number>(0);
  const [temperature, setTemperature] = useState<string>(NONE);
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [crmEnabled, setCrmEnabled] = useState(false);
  const [crmProvider, setCrmProvider] = useState<string>(NONE);
  const [crmConfig, setCrmConfig] = useState("{}");
  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 4;


  useEffect(() => {
    if (!open) return;
    setIsActive(m?.is_active ?? true);
    setStageId(m?.stage_id ?? NONE);
    setAssignedTo(m?.assigned_to ?? NONE);
    setTags((m?.default_tags ?? []).join(", "));
    setScore(m?.default_score ?? 0);
    setTemperature(m?.default_temperature ?? NONE);
    setUtmSource(m?.default_utm_source ?? "");
    setUtmMedium(m?.default_utm_medium ?? "");
    setUtmCampaign(m?.default_utm_campaign ?? "");
    setCrmEnabled(m?.external_crm_enabled ?? false);
    setCrmProvider(m?.external_crm_provider ?? NONE);
    setCrmConfig(JSON.stringify(m?.external_crm_config ?? {}, null, 2));
  }, [open, form?.form_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("Formulário inválido");
      let parsedConfig: Record<string, unknown> = {};
      if (crmEnabled) {
        try {
          parsedConfig = JSON.parse(crmConfig || "{}");
        } catch {
          throw new Error("Config CRM externo: JSON inválido.");
        }
      }
      return save({
        data: {
          page_id: form.page_id,
          page_name: form.page_name,
          form_id: form.form_id,
          form_name: form.form_name,
          is_active: isActive,
          source: "facebook",
          channel: "meta_lead_ads",
          medium: "lead_ads",
          default_utm_source: utmSource || null,
          default_utm_medium: utmMedium || null,
          default_utm_campaign: utmCampaign || null,
          stage_id: stageId === NONE ? null : stageId,
          assigned_to: assignedTo === NONE ? null : assignedTo,
          default_tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          default_score: Number.isFinite(score) ? score : 0,
          default_temperature:
            temperature === NONE ? null : (temperature as "cold" | "warm" | "hot"),
          qualification_rules: [],
          external_crm_enabled: crmEnabled,
          external_crm_provider: crmEnabled
            ? crmProvider === NONE
              ? null
              : crmProvider
            : null,
          external_crm_config: parsedConfig,
          external_crm_conditions: {},
        },
      });
    },
    onSuccess: () => {
      toast.success("Mapeamento salvo");
      qc.invalidateQueries({ queryKey: ["meta-forms"] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: () => {
      if (!m?.id) throw new Error("Sem mapeamento para remover");
      return remove({ data: { id: m.id } });
    },
    onSuccess: () => {
      toast.success("Mapeamento removido");
      qc.invalidateQueries({ queryKey: ["meta-forms"] });
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Configurar formulário Meta</SheetTitle>
          <SheetDescription>
            {form ? (
              <>
                <span className="font-medium text-foreground">{form.form_name}</span>
                <span className="block text-xs">
                  {form.page_name} · {form.form_id}
                </span>
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Etapa 1: Origem/UTM */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Badge variant="outline">1</Badge> Origem / UTM padrão
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">utm_source</Label>
                <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="facebook" />
              </div>
              <div>
                <Label className="text-xs">utm_medium</Label>
                <Input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="lead_ads" />
              </div>
              <div>
                <Label className="text-xs">utm_campaign</Label>
                <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="" />
              </div>
            </div>
          </section>

          <Separator />

          {/* Etapa 2: Roteamento */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Badge variant="outline">2</Badge> Roteamento
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Etapa do pipeline</Label>
                <Select value={stageId} onValueChange={setStageId}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Sem etapa —</SelectItem>
                    {options.data?.stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Responsável</Label>
                <Select value={assignedTo} onValueChange={setAssignedTo}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Não atribuir —</SelectItem>
                    {options.data?.members.map((mem) => (
                      <SelectItem key={mem.user_id} value={mem.user_id}>
                        {mem.user_id.slice(0, 8)}… ({mem.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Se desativado, os leads deste formulário continuam sendo capturados mas não são roteados.
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </section>

          <Separator />

          {/* Etapa 3: Qualificação */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Badge variant="outline">3</Badge> Qualificação padrão
            </h3>
            <div>
              <Label className="text-xs">Tags (separadas por vírgula)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="meta, lead_ads, quente" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Score inicial</Label>
                <Input
                  type="number"
                  value={score}
                  onChange={(e) => setScore(parseInt(e.target.value || "0", 10))}
                />
              </div>
              <div>
                <Label className="text-xs">Temperatura</Label>
                <Select value={temperature} onValueChange={setTemperature}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— Nenhuma —</SelectItem>
                    <SelectItem value="cold">Fria</SelectItem>
                    <SelectItem value="warm">Morna</SelectItem>
                    <SelectItem value="hot">Quente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          {/* Etapa 4: CRM Externo */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Badge variant="outline">4</Badge> CRM externo (opcional)
            </h3>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="text-sm">Enviar para CRM externo</Label>
                <p className="text-xs text-muted-foreground">
                  Ex.: CV CRM, RD Station, HubSpot. O lead ainda entra no pipeline interno.
                </p>
              </div>
              <Switch checked={crmEnabled} onCheckedChange={setCrmEnabled} />
            </div>
            {crmEnabled && (
              <>
                <div>
                  <Label className="text-xs">Provedor</Label>
                  <Select value={crmProvider} onValueChange={setCrmProvider}>
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Selecionar —</SelectItem>
                      <SelectItem value="cvcrm">CV CRM</SelectItem>
                      <SelectItem value="rdstation">RD Station</SelectItem>
                      <SelectItem value="hubspot">HubSpot</SelectItem>
                      <SelectItem value="pipedrive">Pipedrive</SelectItem>
                      <SelectItem value="custom_webhook">Webhook customizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Config (JSON)</Label>
                  <Textarea
                    rows={6}
                    value={crmConfig}
                    onChange={(e) => setCrmConfig(e.target.value)}
                    className="font-mono text-xs"
                    placeholder='{"webhook_url": "https://..."}'
                  />
                </div>
              </>
            )}
          </section>

          <Separator />

          {/* Etapa 5: Ações */}
          <section className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeMutation.mutate()}
              disabled={!m?.id || removeMutation.isPending}
              className="text-destructive hover:text-destructive"
            >
              {removeMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Remover mapeamento
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Salvar
              </Button>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
