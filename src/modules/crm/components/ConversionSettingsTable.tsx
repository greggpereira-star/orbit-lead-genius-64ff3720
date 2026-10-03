import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { AlertCircle, Tag } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { listStages } from '@/modules/crm/services/stageService';
import {
  EVENTOS_META, SO_MEDIR, listConversionMappings, salvarConversionMapping,
  type ConversionMapping,
} from '@/modules/crm/services/conversionMappingService';
import { listarEtiquetasDaEmpresa } from '@/lib/whatsapp-labels.functions';

/**
 * Todas as etapas e o que cada uma significa, numa tabela só.
 *
 * A configuração já existia, mas enterrada: um bloco dobrável por etapa, dentro
 * do gerenciador. Para montar um cliente novo era preciso expandir degrau por
 * degrau, sem nunca ver o funil inteiro. Quem configura precisa comparar as
 * etapas entre si — "qual destas é o corte?" é uma pergunta sobre o conjunto,
 * não sobre uma linha.
 */
export function ConversionSettingsTable({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const buscarEtiquetas = useServerFn(listarEtiquetasDaEmpresa);

  const stages = useQuery({
    queryKey: ['stages', companyId],
    queryFn: () => listStages(companyId),
    enabled: Boolean(companyId),
  });
  const mappings = useQuery({
    queryKey: ['conversion-mappings', companyId],
    queryFn: () => listConversionMappings(companyId),
    enabled: Boolean(companyId),
  });
  const etiquetas = useQuery({
    queryKey: ['etiquetas-whatsapp', companyId],
    queryFn: () => buscarEtiquetas(),
    enabled: Boolean(companyId),
    staleTime: 60_000,
  });

  const porEtapa = useMemo(() => {
    const m = new Map<string, ConversionMapping>();
    for (const x of mappings.data ?? []) m.set(x.stage_id, x);
    return m;
  }, [mappings.data]);

  const salvar = useMutation({
    mutationFn: (p: { stageId: string; evento: string; etiqueta: string | null; valor: boolean }) =>
      salvarConversionMapping({
        companyId,
        stageId: p.stageId,
        metaEventName: p.evento === '__nenhum__' ? null : p.evento,
        whatsappLabel: p.etiqueta,
        sendDealValue: p.valor,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversion-mappings', companyId] }),
    onError: (e: Error) => toast.error('Não deu para salvar', { description: e.message }),
  });

  const listaEtiquetas = etiquetas.data?.etiquetas ?? [];
  const semEtiquetas = etiquetas.data && !etiquetas.data.ok;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Diga o que cada etapa significa. A etiqueta é a mesma etapa vista do WhatsApp:
        etiquetar lá move o card aqui, e mover aqui etiqueta lá.
      </p>

      {/* Sem WhatsApp conectado a lista não existe. Dizer o motivo evita que a
          pessoa ache que a conta não tem etiqueta nenhuma. */}
      {semEtiquetas && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-muted-foreground">
            Não deu para listar as etiquetas: {etiquetas.data?.motivo}. Você ainda pode
            digitar o nome, mas confira a grafia — a Evolution só aplica etiqueta que já
            existe no aparelho.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">Etapa</th>
              <th className="pb-2 pr-3 font-medium">O que significa</th>
              <th className="pb-2 pr-3 font-medium">Etiqueta no WhatsApp</th>
              <th className="pb-2 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {(stages.data ?? []).map((s) => {
              const m = porEtapa.get(s.id);
              const evento = m ? (m.meta_event_name ?? SO_MEDIR) : '__nenhum__';
              const etiqueta = m?.whatsapp_label ?? '';
              const valor = m?.send_deal_value ?? false;
              const envia = evento !== '__nenhum__' && evento !== SO_MEDIR;

              return (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      {s.name}
                    </span>
                  </td>

                  <td className="py-2 pr-3">
                    <Select
                      value={evento}
                      onValueChange={(v) => salvar.mutate({ stageId: s.id, evento: v, etiqueta: etiqueta || null, valor })}
                    >
                      <SelectTrigger className="h-8 w-56" aria-label={`O que a etapa ${s.name} significa`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__nenhum__">Não é conversão</SelectItem>
                        <SelectItem value={SO_MEDIR}>Só medir (não envia)</SelectItem>
                        {EVENTOS_META.map((e) => (
                          <SelectItem key={e.valor} value={e.valor}>{e.rotulo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>

                  <td className="py-2 pr-3">
                    {listaEtiquetas.length > 0 ? (
                      <Select
                        value={etiqueta || '__sem__'}
                        onValueChange={(v) =>
                          salvar.mutate({ stageId: s.id, evento, etiqueta: v === '__sem__' ? null : v, valor })
                        }
                      >
                        <SelectTrigger className="h-8 w-48" aria-label={`Etiqueta da etapa ${s.name}`}>
                          <SelectValue placeholder="Nenhuma" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__sem__">Nenhuma</SelectItem>
                          {listaEtiquetas.map((n) => (
                            <SelectItem key={n} value={n}>
                              <span className="inline-flex items-center gap-1.5">
                                <Tag className="h-3 w-3" />{n}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        defaultValue={etiqueta}
                        placeholder="—"
                        className="h-8 w-48"
                        aria-label={`Etiqueta da etapa ${s.name}`}
                        onBlur={(e) =>
                          e.target.value !== etiqueta &&
                          salvar.mutate({ stageId: s.id, evento, etiqueta: e.target.value || null, valor })
                        }
                      />
                    )}
                  </td>

                  <td className="py-2">
                    {/* Valor só faz sentido quando há para onde enviar, e só em
                        etapa de fechamento: valor em evento de lead ensina a
                        Meta a otimizar pela métrica errada. */}
                    {envia ? (
                      <Switch
                        checked={valor}
                        onCheckedChange={(v) => salvar.mutate({ stageId: s.id, evento, etiqueta: etiqueta || null, valor: v })}
                        aria-label={`Mandar valor da venda na etapa ${s.name}`}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
