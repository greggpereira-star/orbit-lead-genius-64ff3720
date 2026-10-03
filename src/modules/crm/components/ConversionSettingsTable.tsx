import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { AlertCircle, Tag, FlaskConical, Radio, ChevronDown, CornerDownRight } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { listStages } from '@/modules/crm/services/stageService';
import {
  EVENTOS_META, SO_MEDIR, EVENTO_PERSONALIZADO, profundidadeDoEvento,
  listConversionMappings, salvarConversionMapping,
  lerModoEnsaio, salvarModoEnsaio,
  type ConversionMapping,
} from '@/modules/crm/services/conversionMappingService';
import { listarEtiquetasDaEmpresa } from '@/lib/whatsapp-labels.functions';

const NENHUM = '__nenhum__';
const SEM_ETIQUETA = '__sem__';

/** Só a grade do desktop; no celular cada campo vira um bloco rotulado. */
const GRADE = 'md:grid-cols-[13rem_minmax(0,1fr)_12rem_4.5rem]';

/** Distância do topo da linha até o centro do ponto da etapa. Ver a espinha. */
const CENTRO_DO_PONTO = '22px';

/**
 * O que cada degrau do funil significa para a mídia.
 *
 * A versão anterior era uma tabela de quatro colunas com percentuais. Ela
 * escondia as duas coisas que mais importam aqui, e que são DADO, não enfeite:
 * as etapas são uma sequência, e os eventos da Meta também têm profundidade.
 * Sem isso na tela, configurar virava decorar — e um engano comum (uma etapa
 * mais funda apontando para um evento mais raso) não tinha como aparecer.
 *
 * Então a tabela virou uma espinha: os degraus ligados na ordem em que o lead
 * os percorre, e uma leitura de profundidade que só fala quando algo está fora
 * de ordem. O resto fica quieto de propósito.
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
        metaEventName: p.evento === NENHUM ? null : p.evento,
        whatsappLabel: p.etiqueta,
        sendDealValue: p.valor,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversion-mappings', companyId] }),
    onError: (e: Error) => toast.error('Não deu para salvar', { description: e.message }),
  });

  const listaEtiquetas = etiquetas.data?.etiquetas ?? [];
  const semEtiquetas = etiquetas.data && !etiquetas.data.ok;
  const lista = stages.data ?? [];

  /**
   * As duas conferências que a tela faz sozinha.
   *
   * Nenhuma inventa regra: as duas leem o que está salvo. A primeira responde a
   * dúvida mais comum de quem monta isso — "não vai duplicar evento?". Não vai,
   * desde que dois degraus não mandem o MESMO nome, que é o único caso em que
   * duplicaria de verdade. A segunda usa a ordem de EVENTOS_META como régua de
   * profundidade.
   */
  const avisos = useMemo(() => {
    const enviando = lista
      .map((s) => ({ etapa: s, evento: porEtapa.get(s.id)?.meta_event_name ?? null }))
      .filter((x): x is { etapa: typeof lista[number]; evento: string } =>
        Boolean(x.evento) && x.evento !== SO_MEDIR);

    const porNome = new Map<string, string[]>();
    for (const x of enviando) {
      porNome.set(x.evento, [...(porNome.get(x.evento) ?? []), x.etapa.name]);
    }
    const repetidos = [...porNome.entries()].filter(([, etapas]) => etapas.length > 1);

    const foraDeOrdem: Array<{ etapa: string; anterior: string }> = [];
    let maior = -1;
    let nomeDoMaior = '';
    for (const x of enviando) {
      const d = profundidadeDoEvento(x.evento);
      if (d === -1) continue; // personalizado não tem posição na régua
      if (d < maior) foraDeOrdem.push({ etapa: x.etapa.name, anterior: nomeDoMaior });
      else { maior = d; nomeDoMaior = x.etapa.name; }
    }

    return { repetidos, foraDeOrdem, quantosEnviam: enviando.length };
  }, [lista, porEtapa]);

  const emEnsaio = ensaio.data === true;

  return (
    <div className="space-y-4">
      {/* Primeira coisa da aba, de propósito. Quem abre esta tela está a um
          clique de mandar conversão real para a campanha do cliente, e o estado
          precisa ser legível antes disso — não depois. */}
      <div
        className={`flex items-start justify-between gap-4 rounded-lg border p-3 ${
          emEnsaio ? 'border-amber-500/40 bg-amber-500/10' : 'border-emerald-600/30 bg-emerald-600/5'
        }`}
      >
        <div className="flex items-start gap-2.5">
          {emEnsaio
            ? <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            : <Radio className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
          <div className="space-y-1 text-sm">
            <p className="font-medium">{emEnsaio ? 'Modo de ensaio ligado' : 'Enviando de verdade'}</p>
            <p className="text-muted-foreground">
              {emEnsaio
                ? 'As etapas montam o evento e registram o que teria sido enviado, mas nada chega na Meta nem no Google. A etiqueta no WhatsApp continua sendo aplicada, para você conferir o resultado visível.'
                : 'Cada etapa configurada manda conversão real, e isso entra na otimização da campanha. Ligue o ensaio antes de testar movendo cartões.'}
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

      {/* O texto longo é lido uma vez e vira ruído para sempre. Fica a uma
          linha de distância, não ocupando meio visor em toda visita. */}
      <Collapsible>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{avisos.quantosEnviam}</span>
            {' '}de{' '}<span className="font-medium text-foreground">{lista.length}</span>
            {' '}etapas enviam conversão.
          </p>
          <CollapsibleTrigger className="group inline-flex items-center gap-1 rounded text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Como isso funciona
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-2 space-y-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <p>
            Cada etapa pode avisar a Meta e o Google quando um lead chega nela. São eventos{' '}
            <span className="font-medium text-foreground">diferentes</span>, não repetidos: um lead
            que passa por três etapas configuradas envia três avisos distintos, e é assim que o
            algoritmo aprende a diferença entre quem só conversa e quem compra. A mesma etapa nunca
            envia duas vezes para o mesmo lead, mesmo que ele volte e avance de novo.
          </p>
          <p>
            <span className="font-medium text-foreground">Etiquetas</span> precisam existir no
            WhatsApp antes. O CRM aplica uma que já existe — ele não cria. Crie no aparelho em
            Configurações da empresa → Etiquetas, e ela aparece aqui na lista.
          </p>
        </CollapsibleContent>
      </Collapsible>

      {(avisos.repetidos.length > 0 || avisos.foraDeOrdem.length > 0 || semEtiquetas) && (
        <div className="space-y-2">
          {avisos.repetidos.map(([evento, etapas]) => (
            <Aviso key={evento}>
              <span className="font-medium text-foreground">{etapas.join(' e ')}</span> mandam o
              mesmo evento <Mono>{evento}</Mono>. Aí sim o mesmo lead conta duas vezes na Meta —
              dê um evento diferente para cada degrau.
            </Aviso>
          ))}
          {avisos.foraDeOrdem.map((x) => (
            <Aviso key={x.etapa}>
              <span className="font-medium text-foreground">{x.etapa}</span> vem depois de{' '}
              <span className="font-medium text-foreground">{x.anterior}</span> no funil, mas aponta
              para um evento mais raso. Confira se não trocou um pelo outro.
            </Aviso>
          ))}
          {semEtiquetas && (
            <Aviso>
              Não deu para listar as etiquetas: {etiquetas.data?.motivo}. Você ainda pode digitar o
              nome, mas confira a grafia — a Evolution só aplica etiqueta que já existe no aparelho.
            </Aviso>
          )}
        </div>
      )}

      {/* Cabeçalho só onde existe grade. No celular cada campo se apresenta. */}
      <div className={`hidden gap-x-4 border-b pb-2 text-xs font-medium text-muted-foreground md:grid ${GRADE}`}>
        <span>Etapa</span>
        <span>Quando o lead entra aqui</span>
        <span>Etiqueta no WhatsApp</span>
        <span>Mandar valor</span>
      </div>

      <ol>
        {lista.map((s, i) => {
          const m = porEtapa.get(s.id);
          const salvo = m ? (m.meta_event_name ?? SO_MEDIR) : NENHUM;
          const padrao = EVENTOS_META.find((e) => e.valor === salvo);
          // Evento salvo fora da lista é personalizado — e precisa continuar
          // aparecendo como tal ao reabrir a tela, senão o seletor voltaria
          // vazio e a pessoa acharia que perdeu.
          const personalizado = salvo !== NENHUM && salvo !== SO_MEDIR && !padrao;
          const evento = personalizado || escrevendo.has(s.id) ? EVENTO_PERSONALIZADO : salvo;
          const etiqueta = m?.whatsapp_label ?? '';
          const valor = m?.send_deal_value ?? false;
          const envia = evento !== NENHUM && evento !== SO_MEDIR;

          const explica =
            evento === NENHUM ? 'Nada é enviado. É só um degrau do funil.'
            : evento === SO_MEDIR ? 'Conta como qualificado nos seus relatórios. Nada sai para a Meta nem para o Google.'
            : evento === EVENTO_PERSONALIZADO ? 'Para virar meta de otimização, crie uma Conversão personalizada com esse nome no Gerenciador de Eventos da Meta.'
            : padrao?.explica;

          return (
            <li
              key={s.id}
              className={`relative grid gap-x-4 gap-y-3 border-b py-3 last:border-0 md:items-start ${GRADE}`}
            >
              {/* A espinha do funil: a ordem que já existe, tornada visível —
                  é o caminho que o lead percorre, de cima para baixo.
                  
                  Desenhada em segmentos, um por degrau, e não como uma linha só
                  na lista inteira: o ponto fica no TOPO de cada linha e as
                  linhas têm alturas diferentes, então uma linha única acabaria
                  bem depois do último ponto, pendurada no vazio. CENTRO_DO_PONTO
                  é py-3 (12px) mais meia altura de linha do text-sm (10px). */}
              {lista.length > 1 && (
                <span
                  aria-hidden
                  className="absolute left-[5px] w-px bg-border"
                  style={{
                    top: i === 0 ? CENTRO_DO_PONTO : 0,
                    bottom: i === lista.length - 1 ? `calc(100% - ${CENTRO_DO_PONTO})` : 0,
                  }}
                />
              )}

              {/* O ponto fica por cima da espinha, com anel da cor do fundo:
                  é o que faz a linha parecer passar POR trás dele. */}
              <div className="relative flex items-center gap-2.5">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ring-4 ring-background ${envia ? '' : 'opacity-40'}`}
                  style={{ background: s.color }}
                />
                <span className={`text-sm ${envia ? 'font-medium' : 'text-muted-foreground'}`}>
                  {s.name}
                </span>
              </div>

              <div className="min-w-0 space-y-1.5 md:pl-0 pl-[1.25rem]">
                <Campo>Quando o lead entra aqui</Campo>
                <div className="flex items-center gap-2">
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
                    <SelectTrigger className="h-9 min-w-0 flex-1" aria-label={`O que a etapa ${s.name} significa`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NENHUM}>Não é conversão</SelectItem>
                      <SelectItem value={SO_MEDIR}>Só medir (não envia)</SelectItem>
                      {EVENTOS_META.map((e) => (
                        <SelectItem key={e.valor} value={e.valor}>{e.rotulo}</SelectItem>
                      ))}
                      {/* Nenhuma lista cobre todo nicho. "Matrícula", "orçamento
                          aprovado", "laudo entregue" — o nome do degrau é do
                          negócio, não da plataforma. */}
                      <SelectItem value={EVENTO_PERSONALIZADO}>Outro evento (eu escrevo)</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* O nome literal que a Meta recebe, em mono porque é um
                      identificador, não um rótulo. Antes ele vivia dentro da
                      frase ("Envia QualifiedLead."), onde era fácil não
                      perceber que aquilo era uma string exata. */}
                  {padrao && <Mono>{padrao.valor}</Mono>}
                  {personalizado && <Mono>{salvo}</Mono>}
                </div>

                {evento === EVENTO_PERSONALIZADO && (
                  <Input
                    defaultValue={personalizado ? salvo : ''}
                    placeholder="Nome do evento (ex.: ContratoEnviado)"
                    className="h-9"
                    aria-label={`Nome do evento personalizado da etapa ${s.name}`}
                    onBlur={(ev) => {
                      // Sem espaço e sem acento: é um identificador que vai para
                      // a API da Meta, não um rótulo de tela.
                      const nome = ev.target.value
                        .normalize('NFD').replace(/[̀-ͯ]/g, '')
                        .replace(/[^A-Za-z0-9_]/g, '');
                      if (nome && nome !== salvo) {
                        marcarEscrevendo(s.id, false);
                        salvar.mutate({ stageId: s.id, evento: nome, etiqueta: etiqueta || null, valor });
                      }
                    }}
                  />
                )}

                <p className="flex items-start gap-1.5 text-[11px] leading-snug text-muted-foreground">
                  <CornerDownRight className="mt-px h-3 w-3 shrink-0 opacity-50" />
                  <span>{explica}</span>
                </p>
              </div>

              <div className="min-w-0 space-y-1.5 md:pl-0 pl-[1.25rem]">
                <Campo>Etiqueta no WhatsApp</Campo>
                {listaEtiquetas.length > 0 ? (
                  <Select
                    value={etiqueta || SEM_ETIQUETA}
                    onValueChange={(v) =>
                      salvar.mutate({ stageId: s.id, evento, etiqueta: v === SEM_ETIQUETA ? null : v, valor })
                    }
                  >
                    <SelectTrigger className="h-9 w-full" aria-label={`Etiqueta da etapa ${s.name}`}>
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_ETIQUETA}>Nenhuma</SelectItem>
                      {listaEtiquetas.map((n) => (
                        <SelectItem key={n} value={n}>
                          <span className="inline-flex items-center gap-1.5"><Tag className="h-3 w-3" />{n}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    defaultValue={etiqueta}
                    // "—" lia como se fosse um valor gravado. Um campo vazio diz
                    // o que acontece quando ninguém o preenche.
                    placeholder="Nenhuma"
                    className="h-9 w-full"
                    aria-label={`Etiqueta da etapa ${s.name}`}
                    onBlur={(e) =>
                      e.target.value !== etiqueta &&
                      salvar.mutate({ stageId: s.id, evento, etiqueta: e.target.value || null, valor })
                    }
                  />
                )}
              </div>

              <div className="space-y-1.5 md:pl-0 pl-[1.25rem]">
                <Campo>Mandar valor</Campo>
                {/* Valor só faz sentido quando há para onde enviar, e só em
                    etapa de fechamento: valor em evento de lead ensina a Meta a
                    otimizar pela métrica errada. */}
                {envia ? (
                  <div className="flex h-9 items-center">
                    <Switch
                      checked={valor}
                      onCheckedChange={(v) => salvar.mutate({ stageId: s.id, evento, etiqueta: etiqueta || null, valor: v })}
                      aria-label={`Mandar valor da venda na etapa ${s.name}`}
                    />
                  </div>
                ) : (
                  <p className="flex h-9 items-center text-xs text-muted-foreground">—</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Rótulo do campo no celular, onde não há cabeçalho de coluna para explicá-lo. */
function Campo({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs font-medium text-muted-foreground md:hidden">{children}</span>;
}

/** Identificador literal que vai para a API — mono para não parecer rótulo. */
function Mono({ children }: { children: React.ReactNode }) {
  return (
    <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {children}
    </code>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}
