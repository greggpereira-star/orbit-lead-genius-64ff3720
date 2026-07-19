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

  const nextStep = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col h-full p-0">
        <div className="p-6 border-b shrink-0">
          <SheetHeader>
            <SheetTitle className="text-xl font-bold">Mapeamento de Formulário Meta</SheetTitle>
            <SheetDescription>
              {form ? (
                <div className="flex flex-col gap-1 mt-1">
                  <Badge variant="secondary" className="w-fit text-xs font-mono uppercase tracking-wider">
                    {form.page_name}
                  </Badge>
                  <span className="font-semibold text-foreground text-lg">{form.form_name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">ID: {form.form_id}</span>
                </div>
              ) : null}
            </SheetDescription>
          </SheetHeader>

          {/* Stepper Visual */}
          <div className="mt-6 relative">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -translate-y-1/2 z-0" />
            <div 
              className="absolute top-1/2 left-0 h-0.5 bg-primary -translate-y-1/2 z-0 transition-all duration-300"
              style={{ width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%` }}
            />
            <div className="relative z-10 flex justify-between">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                    step >= i ? "bg-primary text-primary-foreground shadow-lg scale-110" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              {step === 1 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Origem e Rastreamento</h3>
                    <p className="text-sm text-muted-foreground">Defina como os leads deste formulário serão identificados no sistema.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Origem (utm_source)</Label>
                      <Input 
                        value={utmSource} 
                        onChange={(e) => setUtmSource(e.target.value)} 
                        placeholder="Ex: facebook, instagram" 
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Mídia (utm_medium)</Label>
                      <Input 
                        value={utmMedium} 
                        onChange={(e) => setUtmMedium(e.target.value)} 
                        placeholder="Ex: lead_ads, stories" 
                        className="h-10"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Campanha (utm_campaign)</Label>
                      <Input 
                        value={utmCampaign} 
                        onChange={(e) => setUtmCampaign(e.target.value)} 
                        placeholder="Deixe em branco para usar o ID da campanha do Meta" 
                        className="h-10"
                      />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Roteamento Interno</h3>
                    <p className="text-sm text-muted-foreground">Para onde os leads devem ir e quem deve atendê-los?</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Etapa do Pipeline</Label>
                      <Select value={stageId} onValueChange={setStageId}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Selecionar etapa" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— Sem etapa (apenas entrada) —</SelectItem>
                          {options.data?.stages.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Responsável Automático</Label>
                      <Select value={assignedTo} onValueChange={setAssignedTo}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Selecionar usuário" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>— Rodízio ou Sem atribuição —</SelectItem>
                          {options.data?.members.map((mem) => (
                            <SelectItem key={mem.user_id} value={mem.user_id}>
                              {mem.user_id.slice(0, 8)}… ({mem.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border-2 border-primary/10 bg-primary/5 p-4 transition-all hover:bg-primary/10">
                      <div className="space-y-0.5">
                        <Label className="text-base font-semibold">Processamento Ativo</Label>
                        <p className="text-xs text-muted-foreground pr-4">
                          Se desativado, os leads são registrados mas ignoram regras de automação.
                        </p>
                      </div>
                      <Switch checked={isActive} onCheckedChange={setIsActive} className="data-[state=checked]:bg-primary" />
                    </div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Qualificação e Tags</h3>
                    <p className="text-sm text-muted-foreground">Adicione inteligência aos leads capturados.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Tags Automáticas</Label>
                      <Input 
                        value={tags} 
                        onChange={(e) => setTags(e.target.value)} 
                        placeholder="meta, imovel_luxo, investidor (separe por vírgula)" 
                        className="h-10"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Score Inicial</Label>
                        <Input
                          type="number"
                          value={score}
                          onChange={(e) => setScore(parseInt(e.target.value || "0", 10))}
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Temperatura</Label>
                        <Select value={temperature} onValueChange={setTemperature}>
                          <SelectTrigger className="h-10"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>— Indefinida —</SelectItem>
                            <SelectItem value="cold" className="text-blue-500">❄️ Fria</SelectItem>
                            <SelectItem value="warm" className="text-orange-500">🔥 Morna</SelectItem>
                            <SelectItem value="hot" className="text-red-600">🔥🔥 Quente</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Integração CRM Externo</h3>
                    <p className="text-sm text-muted-foreground">Envie os leads para o CV.CRM ou outras ferramentas.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl border p-4 bg-muted/30">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold">Ativar Sincronização</Label>
                        <p className="text-xs text-muted-foreground">Enviar dados para plataforma externa após captura.</p>
                      </div>
                      <Switch checked={crmEnabled} onCheckedChange={setCrmEnabled} />
                    </div>

                    {crmEnabled && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-4 overflow-hidden"
                      >
                        <div className="space-y-2">
                          <Label className="text-xs font-bold uppercase text-muted-foreground">Plataforma</Label>
                          <Select value={crmProvider} onValueChange={setCrmProvider}>
                            <SelectTrigger className="h-10"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>— Selecionar —</SelectItem>
                              <SelectItem value="cvcrm">CV CRM (Oficial)</SelectItem>
                              <SelectItem value="rdstation">RD Station</SelectItem>
                              <SelectItem value="hubspot">HubSpot</SelectItem>
                              <SelectItem value="custom_webhook">Webhook Customizado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase text-muted-foreground">Configuração Adicional (JSON)</Label>
                            {crmProvider === 'cvcrm' && (
                              <Badge variant="outline" className="text-[10px]">Utilizar Enterprise ID</Badge>
                            )}
                          </div>
                          <Textarea
                            rows={6}
                            value={crmConfig}
                            onChange={(e) => setCrmConfig(e.target.value)}
                            className="font-mono text-[11px] bg-slate-950 text-slate-50 border-slate-800"
                            placeholder={crmProvider === 'cvcrm' ? '{\n  "enterprise_id": "123",\n  "send_utms": true\n}' : '{\n  "webhook_url": "https://..."\n}'}
                          />
                        </div>
                      </motion.div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="p-6 border-t bg-muted/20 shrink-0 flex items-center justify-between">
          <div className="flex gap-2">
            {step > 1 ? (
              <Button variant="outline" onClick={prevStep} size="sm" className="h-9">
                <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMutation.mutate()}
                disabled={!m?.id || removeMutation.isPending}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-9"
              >
                {removeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span className="hidden sm:inline ml-2">Remover Mapeamento</span>
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {step < TOTAL_STEPS ? (
              <Button onClick={nextStep} size="sm" className="h-9 px-4">
                Próximo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button 
                onClick={() => saveMutation.mutate()} 
                disabled={saveMutation.isPending} 
                className="h-9 px-6 shadow-md shadow-primary/20"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Finalizar Configuração
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

}
