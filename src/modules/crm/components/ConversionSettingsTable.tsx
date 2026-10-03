import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import {
  AlertTriangle, BookOpen, CheckCircle2, Code2, ExternalLink, FlaskConical,
  Info, Lightbulb, Radio, RotateCcw, Save, Tag,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { listStages, type Stage } from '@/modules/crm/services/stageService';
import {
  EVENTOS_META, SO_MEDIR, EVENTO_PERSONALIZADO, profundidadeDoEvento,
  listConversionMappings, salvarConversionMapping,
  lerModoEnsaio, salvarModoEnsaio,
  type ConversionMapping,
} from '@/modules/crm/services/conversionMappingService';
import { listarEtiquetasDaEmpresa } from '@/lib/whatsapp-labels.functions';

const NENHUM = '__nenhum__';
const SEM_ETIQUETA = '__sem__';

/**
 * Grade do desktop. No celular cada campo vira um bloco com o próprio rótulo.
 *
 * Todas as colunas em `fr`, nenhuma fixa. A versão anterior fixava quatro
 * larguras e deixava só o resto para o seletor: no modal real sobravam 152px
 * para um rótulo que precisa de ~240px, e "Proposta ou inscrição enviada"
 * aparecia como "Proposta o…". Quem lê a tela não conseguia conferir a
 * configuração sem abrir cada lista.
 *
 * O seletor leva a maior fatia porque é a decisão da linha. O mínimo do
 * `minmax` existe para a grade degradar em vez de espremer quando a janela é
 * menor que o previsto.
 */
const GRADE =
  'lg:grid-cols-[minmax(8rem,1.3fr)_minmax(9rem,1.6fr)_minmax(7rem,1.2fr)_minmax(7rem,1fr)_3rem]';

/**
 * Sugestão de mapeamento pela posição no funil.
 *
 * Não é "o padrão do sistema" — não existe um. É uma escada do raso ao fundo,
 * distribuída pelos degraus abertos que a empresa tem. Serve para quem está
 * montando do zero não encarar sete selects vazios.
 */
const ESCADA = [
  'LeadSubmitted', 'Contact', 'QualifiedLead', 'Schedule', 'SubmitApplication', 'InitiateCheckout',
] as const;

interface Rascunho {
  evento: string;
  etiqueta: string | null;
  valor: boolean;
}

function doMapeamento(m: ConversionMapping | undefined): Rascunho {
  return {
    evento: m ? (m.meta_event_name ?? SO_MEDIR) : NENHUM,
    etiqueta: m?.whatsapp_label ?? null,
    valor: m?.send_deal_value ?? false,
  };
}

/**
 * O que cada degrau do funil significa para a mídia.
 *
 * Grava por lote, não a cada clique: montar um funil são sete decisões que se
 * comparam entre si — "qual destes é o corte?" é pergunta sobre o conjunto.
 * Salvar linha a linha publicava meio funil enquanto a pessoa ainda pensava.
 */
export function ConversionSettingsTable({
  companyId, onClose,
}: {
  companyId: string;
  /** Fechar o diálogo inteiro, do botão Cancelar. */
  onClose?: () => void;
}) {
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
  const ensaio = useQuery({
    queryKey: ['modo-ensaio', companyId],
    queryFn: () => lerModoEnsaio(companyId),
    enabled: Boolean(companyId),
  });

  const salvo = useMemo(() => {
    const m = new Map<string, Rascunho>();
    for (const s of stages.data ?? []) {
      m.set(s.id, doMapeamento((mappings.data ?? []).find((x) => x.stage_id === s.id)));
    }
    return m;
  }, [stages.data, mappings.data]);

  const [rascunho, setRascunho] = useState<Map<string, Rascunho>>(new Map());
  const [escrevendo, setEscrevendo] = useState<Set<string>>(new Set());

  // O rascunho nasce do que está gravado e é refeito quando o servidor
  // responde. Sem isto, salvar deixaria a tela comparando contra dados velhos
  // e tudo continuaria parecendo alterado.
  useEffect(() => { setRascunho(new Map(salvo)); setEscrevendo(new Set()); }, [salvo]);

  const mudar = (stageId: string, parcial: Partial<Rascunho>) =>
    setRascunho((atual) => {
      const proximo = new Map(atual);
      proximo.set(stageId, { ...(proximo.get(stageId) ?? doMapeamento(undefined)), ...parcial });
      return proximo;
    });

  const alterados = useMemo(() => {
    const ids: string[] = [];
    for (const [id, r] of rascunho) {
      const base = salvo.get(id);
      if (!base) continue;
      if (base.evento !== r.evento || base.etiqueta !== r.etiqueta || base.valor !== r.valor) ids.push(id);
    }
    return ids;
  }, [rascunho, salvo]);

  const gravar = useMutation({
    mutationFn: async () => {
      for (const stageId of alterados) {
        const r = rascunho.get(stageId)!;
        // Um de cada vez de propósito: em paralelo, um erro no meio deixaria
        // parte do funil gravada sem a pessoa saber qual parte.
        await salvarConversionMapping({
          companyId,
          stageId,
          metaEventName: r.evento === NENHUM ? null : r.evento,
          whatsappLabel: r.etiqueta,
          sendDealValue: r.valor,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversion-mappings', companyId] });
      toast.success(
        alterados.length === 1 ? '1 etapa salva' : `${alterados.length} etapas salvas`,
      );
    },
    onError: (e: Error) => toast.error('Não deu para salvar', { description: e.message }),
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

  const lista = stages.data ?? [];
  const listaEtiquetas = etiquetas.data?.etiquetas ?? [];
  const semEtiquetas = etiquetas.data && !etiquetas.data.ok;
  const emEnsaio = ensaio.data === true;
  const nenhumMapeado = lista.every((s) => {
    const r = rascunho.get(s.id);
    return !r || r.evento === NENHUM || r.evento === SO_MEDIR;
  });

  /** Preenche o rascunho com a escada do funil. Nada é gravado até Salvar. */
  const sugerir = () => {
    const abertas = lista.filter((s) => s.kind === 'open');
    setRascunho((atual) => {
      const proximo = new Map(atual);
      lista.forEach((s) => {
        const anterior = proximo.get(s.id) ?? doMapeamento(undefined);
        if (s.kind === 'won') { proximo.set(s.id, { ...anterior, evento: 'Purchase', valor: true }); return; }
        if (s.kind === 'lost') { proximo.set(s.id, { ...anterior, evento: NENHUM, valor: false }); return; }
        const i = abertas.findIndex((a) => a.id === s.id);
        const passo = abertas.length > 1
          ? Math.round((i / (abertas.length - 1)) * (ESCADA.length - 1))
          : 0;
        proximo.set(s.id, { ...anterior, evento: ESCADA[passo], valor: false });
      });
      return proximo;
    });
    toast.info('Sugestão aplicada', { description: 'Confira e clique em Salvar para valer.' });
  };

  /**
   * As boas práticas, conferidas contra o que está no rascunho.
   *
   * O mockup trazia quatro conselhos fixos. Conselho fixo é decoração: ele diz
   * a mesma coisa para quem acertou e para quem errou. Duas das quatro regras
   * são verificáveis com os dados que já estão aqui, então elas ficam verdes
   * quando valem e âmbar quando não — nomeando as etapas envolvidas.
   */
  const praticas = useMemo(() => {
    const comEvento = lista
      .map((s) => ({ etapa: s, r: rascunho.get(s.id) }))
      .filter((x): x is { etapa: Stage; r: Rascunho } =>
        Boolean(x.r) && x.r!.evento !== NENHUM && x.r!.evento !== SO_MEDIR);

    const porNome = new Map<string, string[]>();
    for (const x of comEvento) porNome.set(x.r.evento, [...(porNome.get(x.r.evento) ?? []), x.etapa.name]);
    const repetidos = [...porNome.entries()].filter(([, e]) => e.length > 1);

    const foraDeOrdem: string[] = [];
    let maior = -1;
    for (const x of comEvento) {
      const d = profundidadeDoEvento(x.r.evento);
      if (d === -1) continue;
      if (d < maior) foraDeOrdem.push(x.etapa.name); else maior = d;
    }

    const valorForaDeVenda = comEvento
      .filter((x) => x.r.valor && x.etapa.kind !== 'won')
      .map((x) => x.etapa.name);

    return [
      {
        ok: comEvento.length > 0,
        bom: 'Pelo menos um degrau avisa a Meta.',
        ruim: 'Nenhuma etapa envia conversão — a Meta não recebe sinal nenhum deste funil.',
      },
      {
        ok: valorForaDeVenda.length === 0,
        bom: 'O valor está só na etapa de venda.',
        ruim: `Valor ligado fora da venda em ${valorForaDeVenda.join(', ')}. A Meta passaria a otimizar por receita num degrau que não tem receita.`,
      },
      {
        ok: foraDeOrdem.length === 0,
        bom: 'A ordem do funil está do raso para o fundo.',
        ruim: `${foraDeOrdem.join(', ')} aponta para um evento mais raso que o de uma etapa anterior.`,
      },
      {
        ok: repetidos.length === 0,
        bom: 'Cada degrau manda um evento diferente.',
        ruim: repetidos.map(([ev, et]) => `${et.join(' e ')} mandam ${ev}`).join('; ')
          + '. Aí sim o mesmo lead conta duas vezes.',
      },
    ];
  }, [lista, rascunho]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <FaixaDeEnsaio
            ligado={emEnsaio}
            ocupado={ensaio.isLoading || trocarEnsaio.isPending}
            aoTrocar={(v) => trocarEnsaio.mutate(v)}
          />

          {/* Funil sem nenhum degrau mapeado é a tela mais importante e a mais
              muda: sete selects em "Não é conversão" não dizem por onde
              começar. O atalho vem para cima, onde o olho está. */}
          {lista.length > 0 && nenhumMapeado && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4">
              <div className="text-sm">
                <p className="font-medium">Nenhum degrau avisa a Meta ainda</p>
                <p className="text-muted-foreground">
                  Comece pela sugestão e ajuste o que não encaixar no seu nicho.
                </p>
              </div>
              <Button type="button" onClick={sugerir}>
                <RotateCcw className="h-4 w-4" />
                <span className="ml-2">Sugerir pelo funil</span>
              </Button>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="min-w-0">
              {/* `items-end` e `truncate`: "Status no pipeline" quebrava em duas
                  linhas e desalinhava a base dos outros títulos. */}
              <div className={`hidden items-end gap-x-4 px-4 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid ${GRADE}`}>
                <span className="truncate">Etapa do funil</span>
                <span className="truncate">O que significa</span>
                <span className="flex items-center gap-1 truncate">
                  <span className="truncate">Evento na Meta</span>
                  <Dica texto="O nome exato que a Meta recebe. É por ele que você escolhe a meta de otimização no Gerenciador de Anúncios." />
                </span>
                <span className="truncate">Etiqueta no WhatsApp</span>
                <span className="flex items-center gap-1">
                  <span className="truncate">Valor</span>
                  <Dica texto="Manda o valor da venda junto do evento. Só faz sentido na etapa de fechamento: valor num degrau de lead ensina a Meta a otimizar pela métrica errada." />
                </span>
              </div>

              <ul className="space-y-2">
                {lista.map((s) => (
                  <LinhaDaEtapa
                    key={s.id}
                    etapa={s}
                    rascunho={rascunho.get(s.id) ?? doMapeamento(undefined)}
                    alterada={alterados.includes(s.id)}
                    escrevendo={escrevendo.has(s.id)}
                    etiquetasDisponiveis={listaEtiquetas}
                    aoMudar={(p) => mudar(s.id, p)}
                    aoEscrever={(v) => setEscrevendo((a) => {
                      const p = new Set(a);
                      if (v) p.add(s.id); else p.delete(s.id);
                      return p;
                    })}
                  />
                ))}
              </ul>
            </div>

            <PainelDeApoio
              praticas={praticas}
              semEtiquetas={semEtiquetas}
              motivo={etiquetas.data?.motivo ?? undefined}
            />
          </div>
        </div>

        {/* Barra de ações. Fixa no rodapé porque a decisão de gravar é sobre o
            conjunto inteiro, e ela não pode sumir enquanto se rola a lista. */}
        <div className="-mx-6 mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t bg-background px-6 pt-4">
          <Button type="button" variant="outline" onClick={sugerir} disabled={gravar.isPending}>
            <RotateCcw className="h-4 w-4" />
            <span className="ml-2">Sugerir pelo funil</span>
          </Button>

          <div className="flex flex-wrap items-center gap-3">
            {alterados.length > 0 && (
              <span className="text-sm text-amber-700 dark:text-amber-500">
                {alterados.length === 1 ? '1 alteração não salva' : `${alterados.length} alterações não salvas`}
              </span>
            )}
            <Button
              type="button" variant="ghost"
              onClick={() => { setRascunho(new Map(salvo)); onClose?.(); }}
              disabled={gravar.isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => gravar.mutate()}
              disabled={alterados.length === 0 || gravar.isPending}
            >
              <Save className="h-4 w-4" />
              <span className="ml-2">{gravar.isPending ? 'Salvando…' : 'Salvar configurações'}</span>
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Dica({ texto }: { texto: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="rounded-full text-muted-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <Info className="h-3.5 w-3.5" />
          <span className="sr-only">{texto}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{texto}</TooltipContent>
    </Tooltip>
  );
}

function FaixaDeEnsaio({
  ligado, ocupado, aoTrocar,
}: { ligado: boolean; ocupado: boolean; aoTrocar: (v: boolean) => void }) {
  return (
    <div
      className={`flex items-start justify-between gap-4 rounded-xl border p-3 ${
        ligado
          ? 'border-amber-500/40 bg-amber-500/10'
          : 'border-emerald-600/30 bg-emerald-600/5'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {ligado
          ? <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          : <Radio className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
        <div className="space-y-0.5 text-sm">
          <p className="font-medium">{ligado ? 'Modo de ensaio ligado' : 'Enviando de verdade'}</p>
          <p className="text-muted-foreground">
            {ligado
              ? 'As etapas montam o evento e registram o que teria sido enviado, mas nada chega na Meta nem no Google. A etiqueta no WhatsApp continua sendo aplicada.'
              : 'Cada etapa configurada manda conversão real, e isso entra na otimização da campanha.'}
          </p>
        </div>
      </div>
      <Switch checked={ligado} disabled={ocupado} onCheckedChange={aoTrocar} aria-label="Modo de ensaio" />
    </div>
  );
}

function LinhaDaEtapa({
  etapa, rascunho, alterada, escrevendo, etiquetasDisponiveis, aoMudar, aoEscrever,
}: {
  etapa: Stage;
  rascunho: Rascunho;
  alterada: boolean;
  escrevendo: boolean;
  etiquetasDisponiveis: string[];
  aoMudar: (p: Partial<Rascunho>) => void;
  aoEscrever: (v: boolean) => void;
}) {
  const padrao = EVENTOS_META.find((e) => e.valor === rascunho.evento);
  const personalizado = rascunho.evento !== NENHUM && rascunho.evento !== SO_MEDIR && !padrao;
  const noSelect = personalizado || escrevendo ? EVENTO_PERSONALIZADO : rascunho.evento;
  const envia = rascunho.evento !== NENHUM && rascunho.evento !== SO_MEDIR;

  const explica =
    noSelect === NENHUM ? 'Nada é enviado. É só um degrau do funil.'
    : noSelect === SO_MEDIR ? 'Conta nos seus relatórios. Nada sai para a Meta nem para o Google.'
    : noSelect === EVENTO_PERSONALIZADO ? 'Para virar meta de otimização, crie uma Conversão personalizada com esse nome no Gerenciador de Eventos.'
    : padrao?.explica;

  return (
    <li
      className={`grid gap-x-4 gap-y-3 rounded-xl border bg-card p-4 transition-colors lg:items-start ${GRADE} ${
        alterada ? 'border-primary/40 ring-1 ring-primary/20' : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: etapa.color }} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={etapa.name}>{etapa.name}</p>
          {/* Preso em duas linhas: a explicação de "Qualificado" ocupava quatro
              e fazia a linha ficar 2,5× mais alta que a de "Novo lead". Coluna
              com altura irregular não se varre com o olho — e varrer é o que
              se faz aqui, comparando os degraus entre si. */}
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground" title={explica}>
            {explica}
          </p>
        </div>
      </div>

      <div className="min-w-0 space-y-1.5">
        <Rotulo>O que significa</Rotulo>
        <Select
          value={noSelect}
          onValueChange={(v) => {
            if (v === EVENTO_PERSONALIZADO) { aoEscrever(true); return; }
            aoEscrever(false);
            aoMudar({ evento: v, valor: v === NENHUM || v === SO_MEDIR ? false : rascunho.valor });
          }}
        >
          <SelectTrigger className="h-9 w-full" aria-label={`O que a etapa ${etapa.name} significa`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NENHUM}>Não é conversão</SelectItem>
            <SelectItem value={SO_MEDIR}>Só medir (não envia)</SelectItem>
            {EVENTOS_META.map((e) => (
              <SelectItem key={e.valor} value={e.valor}>{e.rotulo}</SelectItem>
            ))}
            {/* Nenhuma lista cobre todo nicho. "Matrícula", "orçamento
                aprovado", "laudo entregue" — o nome do degrau é do negócio. */}
            <SelectItem value={EVENTO_PERSONALIZADO}>Outro evento (eu escrevo)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-0 space-y-1.5">
        <Rotulo>Evento na Meta</Rotulo>
        {noSelect === EVENTO_PERSONALIZADO ? (
          <Input
            defaultValue={personalizado ? rascunho.evento : ''}
            placeholder="ContratoEnviado"
            className="h-9 font-mono text-xs"
            aria-label={`Nome do evento personalizado da etapa ${etapa.name}`}
            onBlur={(ev) => {
              // Sem espaço e sem acento: é um identificador que vai para a API
              // da Meta, não um rótulo de tela.
              const nome = ev.target.value
                .normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[^A-Za-z0-9_]/g, '');
              if (nome) { aoEscrever(false); aoMudar({ evento: nome }); }
            }}
          />
        ) : envia ? (
          <span
            className="flex min-w-0 items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1.5 font-mono text-xs text-primary"
            title={rascunho.evento}
          >
            <Code2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{rascunho.evento}</span>
          </span>
        ) : (
          <span className="inline-flex items-center px-1 text-xs text-muted-foreground">—</span>
        )}
      </div>

      <div className="min-w-0 space-y-1.5">
        <Rotulo>Etiqueta no WhatsApp</Rotulo>
        {etiquetasDisponiveis.length > 0 ? (
          <Select
            value={rascunho.etiqueta || SEM_ETIQUETA}
            onValueChange={(v) => aoMudar({ etiqueta: v === SEM_ETIQUETA ? null : v })}
          >
            <SelectTrigger className="h-9 w-full" aria-label={`Etiqueta da etapa ${etapa.name}`}>
              <SelectValue placeholder="Nenhuma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_ETIQUETA}>Nenhuma</SelectItem>
              {etiquetasDisponiveis.map((n) => (
                <SelectItem key={n} value={n}>
                  <span className="inline-flex items-center gap-1.5"><Tag className="h-3 w-3" />{n}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          // Sem WhatsApp conectado não há lista para escolher. O campo de texto
          // fica, porque a etiqueta digitada funciona — mas precisa parecer
          // editável, e não um select vazio e apagado.
          <Input
            defaultValue={rascunho.etiqueta ?? ''}
            placeholder="Digite o nome"
            className="h-9 w-full"
            aria-label={`Etiqueta da etapa ${etapa.name}`}
            onBlur={(e) => aoMudar({ etiqueta: e.target.value.trim() || null })}
          />
        )}
      </div>

      <div className="space-y-1.5">
        <Rotulo>Valor</Rotulo>
        {/* Valor só existe quando há para onde enviar, e só faz sentido na
            etapa de fechamento: valor em evento de lead ensina a Meta a
            otimizar pela métrica errada. */}
        {envia ? (
          <div className="flex h-9 items-center">
            <Switch
              checked={rascunho.valor}
              onCheckedChange={(v) => aoMudar({ valor: v })}
              aria-label={`Mandar valor da venda na etapa ${etapa.name}`}
            />
          </div>
        ) : (
          <p className="flex h-9 items-center text-xs text-muted-foreground">—</p>
        )}
      </div>
    </li>
  );
}

/** Rótulo do campo no celular, onde não há cabeçalho de coluna. */
function Rotulo({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-medium text-muted-foreground lg:hidden">{children}</span>;
}

function PainelDeApoio({
  praticas, semEtiquetas, motivo,
}: {
  praticas: Array<{ ok: boolean; bom: string; ruim: string }>;
  semEtiquetas: boolean | undefined;
  motivo: string | undefined;
}) {
  return (
    <aside className="space-y-3 rounded-xl border bg-muted/40 p-4">
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold">Boas práticas</p>
          <p className="text-xs text-muted-foreground">conferidas no que está na tela</p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {praticas.map((p) => (
          <li key={p.bom} className="flex items-start gap-2 text-xs leading-snug">
            {p.ok
              ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" />
              : <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" />}
            <span className={p.ok ? 'text-muted-foreground' : 'text-foreground'}>
              {p.ok ? p.bom : p.ruim}
            </span>
          </li>
        ))}
        {semEtiquetas && (
          <li className="flex items-start gap-2 text-xs leading-snug">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span>
              Não deu para listar as etiquetas: {motivo}. Dá para digitar o nome, mas confira a
              grafia — a Evolution só aplica etiqueta que já existe no aparelho.
            </span>
          </li>
        )}
      </ul>

      <div className="space-y-1.5 rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Evento personalizado</p>
        </div>
        <p className="text-xs leading-snug text-muted-foreground">
          Nome fora dos padrões só vira meta de otimização depois de virar uma Conversão
          personalizada no Gerenciador de Eventos.
        </p>
        <a
          href="https://business.facebook.com/events_manager2"
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Abrir Gerenciador de Eventos
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </aside>
  );
}
