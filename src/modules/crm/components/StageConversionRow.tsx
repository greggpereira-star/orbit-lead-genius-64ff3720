import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Target, Loader2 } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  EVENTOS_META,
  salvarConversionMapping,
  type ConversionMapping,
} from '@/modules/crm/services/conversionMappingService';

/**
 * Configuração de conversão de UMA etapa.
 *
 * Fica junto da etapa, e não numa tela de "integrações", porque é da etapa que
 * se trata: quem está montando o funil é quem sabe qual degrau significa "esse
 * lead presta". Separar obrigaria a pessoa a decorar o nome da etapa, sair,
 * procurar e configurar no escuro.
 */
export function StageConversionRow({
  companyId,
  stageId,
  stageName,
  mapping,
}: {
  companyId: string;
  stageId: string;
  stageName: string;
  mapping?: ConversionMapping;
}) {
  const qc = useQueryClient();
  const [evento, setEvento] = useState(mapping?.meta_event_name ?? '__nenhum__');
  const [etiqueta, setEtiqueta] = useState(mapping?.whatsapp_label ?? '');
  const [mandaValor, setMandaValor] = useState(mapping?.send_deal_value ?? false);

  const salvar = useMutation({
    mutationFn: (p: { evento: string; etiqueta: string; valor: boolean }) =>
      salvarConversionMapping({
        companyId,
        stageId,
        metaEventName: p.evento === '__nenhum__' ? null : p.evento,
        whatsappLabel: p.etiqueta,
        sendDealValue: p.valor,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversion-mappings', companyId] });
    },
    onError: (e: Error) => toast.error('Não deu para salvar', { description: e.message }),
  });

  const aplicar = (patch: Partial<{ evento: string; etiqueta: string; valor: boolean }>) => {
    const proximo = { evento, etiqueta, valor: mandaValor, ...patch };
    setEvento(proximo.evento);
    setEtiqueta(proximo.etiqueta);
    setMandaValor(proximo.valor);
    salvar.mutate(proximo);
  };

  const configurado = evento !== '__nenhum__';

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 px-3 py-3">
      <div className="flex items-center gap-2">
        <Target className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium">Conversão ao entrar em “{stageName}”</span>
        {salvar.isPending && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      <Select value={evento} onValueChange={(v) => aplicar({ evento: v })}>
        <SelectTrigger className="h-9" aria-label={`Evento de conversão da etapa ${stageName}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__nenhum__">Não dispara nada</SelectItem>
          {EVENTOS_META.map((e) => (
            <SelectItem key={e.valor} value={e.valor}>
              {e.rotulo} — <span className="text-muted-foreground">{e.dica}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {configurado && (
        <>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground" htmlFor={`etiqueta-${stageId}`}>
              Etiqueta no WhatsApp (opcional)
            </label>
            <Input
              id={`etiqueta-${stageId}`}
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              onBlur={() => aplicar({ etiqueta })}
              placeholder="ex.: qualificado"
              className="h-9"
            />
            {/* A etiqueta não é um segundo gatilho: é a mesma etapa vista do
                WhatsApp. Quem etiqueta lá move o card aqui, e vice-versa — um
                estado só, um evento só. */}
            <p className="text-[11px] leading-snug text-muted-foreground">
              Etiquetar assim no WhatsApp move o lead para esta etapa. É o mesmo
              estado visto dos dois lugares, então nunca conta duas vezes.
            </p>
          </div>

          <label className="flex items-start gap-2.5">
            <Switch checked={mandaValor} onCheckedChange={(v) => aplicar({ valor: v })} className="mt-0.5" />
            <span className="text-[11px] leading-snug text-muted-foreground">
              Mandar o valor da venda junto.{' '}
              <span className="text-foreground">Ligue só em etapa de fechamento</span> — valor
              num evento de lead ensina a Meta a otimizar pela métrica errada.
            </span>
          </label>
        </>
      )}
    </div>
  );
}
