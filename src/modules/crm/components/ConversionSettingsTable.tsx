import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { AlertCircle, Tag, FlaskConical, Radio } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { listStages } from '@/modules/crm/services/stageService';
import {
  EVENTOS_META, SO_MEDIR, EVENTO_PERSONALIZADO,
  listConversionMappings, salvarConversionMapping,
  lerModoEnsaio, salvarModoEnsaio,
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

  // Etapas em que a pessoa escolheu "outro evento" e ainda não digitou o nome.
  // Sem isto, escolher a opção salvaria o valor interno como nome do evento.
  const [escrevendo, setEscrevendo] = useState<Set<string>>(new Set());
  const marcarEscrevendo = (stageId: string, ligado: boolean) =>
    setEscrevendo((atual) => {
      const proximo = new Set(atual);
      if (ligado) proximo.add(stageId);
      else proximo.delete(stageId);
      return proximo;
    });

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

  const ensaio = useQuery({
    queryKey: ['modo-ensaio', companyId],
    queryFn: () => lerModoEnsaio(companyId),
    enabled: Boolean(companyId),
  });
  const trocarEnsaio = useMutation({
    mutationFn: (ligado: boolean) => salvarModoEnsaio(companyId, ligado),
    onSuccess: (_, ligado) => {
      qc.invalidateQueries({ queryKey: ['modo-ensaio', companyId] });
      toast.success(ligado ? 'Ensaio ligado' : 'Ensaio desligado', {
        description: ligado
          ? 'Nada mais sai para a Meta nem para o Google até você desligar.'
          : 'As próximas conversões vão de verdade para a Meta e o Google.',
      });
    },
    onError: (e: Error) => toast.error('Não deu para trocar o modo', { description: e.message }),
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

  const emEnsaio = ensaio.data === true;

  return (
    <div className="space-y-3">
      {/* Primeira coisa na aba, de propósito. Quem abre esta tela está a um
          clique de mandar conversão real para a campanha do cliente, e o
          estado precisa ser legível antes disso — não depois. */}
      <div
        className={`flex items-start justify-between gap-4 rounded-lg border p-3 ${
          emEnsaio
            ? 'border-amber-500/40 bg-amber-500/10'
            : 'border-emerald-600/30 bg-emerald-600/5'
        }`}
      >
        <div className="flex items-start gap-2.5">
          {emEnsaio ? (
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          ) : (
            <Radio className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          )}
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              {emEnsaio ? 'Modo de ensaio ligado' : 'Enviando de verdade'}
            </p>
            <p className="text-muted-foreground">
              {emEnsaio
                ? 'As etapas montam o evento e registram o que teria sido enviado, mas nada chega na Meta nem no Google. A etiqueta no WhatsApp continua sendo aplicada, para você conferir o resultado visível. Nenhuma campanha é afetada.'
                : 'Cada etapa configurada manda conversão real para a Meta e o Google, e isso entra na otimização da campanha. Ligue o ensaio antes de testar movendo cartões.'}
            </p>
          </div>
        </div>
        <Switch
          checked={emEnsaio}
          disabled={ensaio.isLoading || trocarEnsaio.isPending}
          onCheckedChange={(v) => trocarEnsaio.mutate(v)}
          aria-label="Modo de ensaio"
        />
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="text-muted-foreground">
          Cada etapa pode avisar a Meta e o Google quando um lead chega nela. São eventos{' '}
          <span className="font-medium text-foreground">diferentes</span>, não repetidos: um lead
          que passa por três etapas configuradas envia três avisos distintos, e é assim que o
          algoritmo aprende a diferença entre quem só conversa e quem compra.
        </p>
        <p className="text-muted-foreground">
          A mesma etapa nunca envia duas vezes para o mesmo lead, mesmo que ele volte e avance de novo.
        </p>
      </div>

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

      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Sobre as etiquetas:</span> elas precisam
        existir no WhatsApp antes. O CRM aplica uma etiqueta que já existe — ele não cria.
        Crie no aparelho em <span className="font-medium">Configurações da empresa → Etiquetas</span>,
        e ela aparece aqui na lista.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-[22%] pb-2 pr-3 font-medium">Etapa</th>
              <th className="w-[40%] pb-2 pr-3 font-medium">Quando o lead entra aqui</th>
              <th className="w-[26%] pb-2 pr-3 font-medium">Etiqueta no WhatsApp</th>
              <th className="w-[12%] pb-2 font-medium whitespace-nowrap">Mandar valor</th>
            </tr>
          </thead>
          <tbody>
            {(stages.data ?? []).map((s) => {
              const m = porEtapa.get(s.id);
              const salvo = m ? (m.meta_event_name ?? SO_MEDIR) : '__nenhum__';
              const ehPadrao = EVENTOS_META.some((e) => e.valor === salvo);
              // Evento salvo que não está na lista é personalizado — e precisa
              // continuar aparecendo como tal ao reabrir a tela, senão o
              // seletor voltaria vazio e a pessoa acharia que perdeu.
              const personalizado = salvo !== '__nenhum__' && salvo !== SO_MEDIR && !ehPadrao;
              const evento = personalizado || escrevendo.has(s.id) ? EVENTO_PERSONALIZADO : salvo;
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
                      onValueChange={(v) => {
                        if (v === EVENTO_PERSONALIZADO) {
                          // Só abre o campo. Salvar agora gravaria o valor
                          // interno como se fosse o nome do evento.
                          marcarEscrevendo(s.id, true);
                          return;
                        }
                        marcarEscrevendo(s.id, false);
                        salvar.mutate({ stageId: s.id, evento: v, etiqueta: etiqueta || null, valor });
                      }}
                    >
                      <SelectTrigger className="h-8 w-full" aria-label={`O que a etapa ${s.name} significa`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__nenhum__">Não é conversão</SelectItem>
                        <SelectItem value={SO_MEDIR}>Só medir (não envia)</SelectItem>
                        {EVENTOS_META.map((e) => (
                          <SelectItem key={e.valor} value={e.valor}>{e.rotulo}</SelectItem>
                        ))}
                        {/* Nenhuma lista cobre todo nicho. "Matrícula",
                            "orçamento aprovado", "laudo entregue" — o nome do
                            degrau é do negócio, não da plataforma. */}
                        <SelectItem value={EVENTO_PERSONALIZADO}>Outro evento (eu escrevo)</SelectItem>
                      </SelectContent>
                    </Select>
                    {evento === EVENTO_PERSONALIZADO && (
                      <Input
                        defaultValue={personalizado ? salvo : ''}
                        placeholder="Nome do evento (ex.: ContratoEnviado)"
                        className="mt-1.5 h-8 w-full"
                        aria-label={`Nome do evento personalizado da etapa ${s.name}`}
                        onBlur={(ev) => {
                          // Sem espaço e sem acento: é um identificador que vai
                          // para a API da Meta, não um rótulo de tela.
                          const nome = ev.target.value
                            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                            .replace(/[^A-Za-z0-9_]/g, '');
                          if (nome && nome !== salvo) {
                            marcarEscrevendo(s.id, false);
                            salvar.mutate({ stageId: s.id, evento: nome, etiqueta: etiqueta || null, valor });
                          }
                        }}
                      />
                    )}
                    {/* A dúvida que o seletor sozinho não resolve é "isso manda
                        o quê, para onde". A frase embaixo responde sem exigir
                        que a pessoa abra a lista de novo. */}
                    <p className="mt-1 max-w-[20rem] text-[11px] leading-snug text-muted-foreground">
                      {evento === '__nenhum__'
                        ? 'Nada é enviado. É só um degrau do funil.'
                        : evento === SO_MEDIR
                          ? 'Conta como qualificado nos seus relatórios. Nada é enviado para a Meta nem para o Google.'
                          : evento === EVENTO_PERSONALIZADO
                            ? 'Para virar meta de otimização, crie uma Conversão personalizada com esse nome no Gerenciador de Eventos da Meta.'
                            : EVENTOS_META.find((e) => e.valor === evento)?.explica}
                    </p>
                  </td>

                  <td className="py-2 pr-3">
                    {listaEtiquetas.length > 0 ? (
                      <Select
                        value={etiqueta || '__sem__'}
                        onValueChange={(v) =>
                          salvar.mutate({ stageId: s.id, evento, etiqueta: v === '__sem__' ? null : v, valor })
                        }
                      >
                        <SelectTrigger className="h-8 w-full" aria-label={`Etiqueta da etapa ${s.name}`}>
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
                        className="h-8 w-full"
                        aria-label={`Etiqueta da etapa ${s.name}`}
                        onBlur={(e) =>
                          e.target.value !== etiqueta &&
                          salvar.mutate({ stageId: s.id, evento, etiqueta: e.target.value || null, valor })
                        }
                      />
                    )}
                  </td>

                  <td className="py-2 align-top">
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
