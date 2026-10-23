import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import {
  AlertTriangle, BookOpen, CheckCircle2, Code2, ExternalLink, FlaskConical,
  Info, Lightbulb, Radio, RotateCcw, Save, Tag,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
 * Todas as colunas em `fr`, nenhuma fixa: com larguras fixas sobravam 152px para um
 * rótulo que precisa de ~240px, e "Proposta ou inscrição enviada" aparecia como
 * "Proposta o…". Quem lê a tela não conseguia conferir a configuração sem abrir cada lista.
 *
 * O seletor leva a maior fatia porque é a decisão da linha. As duas grades existem porque a
 * coluna da etiqueta do WhatsApp some quando o canal não está disponível (ver
 * `mostrarWhatsapp`) — e a largura que ela ocupava volta para o seletor. As classes são
 * literais, e não montadas, para o Tailwind enxergá-las.
 */
const GRADE_COM_WHATSAPP =
  'lg:grid-cols-[minmax(8rem,1.2fr)_minmax(10rem,1.9fr)_minmax(7rem,1.1fr)_minmax(7rem,1fr)_minmax(7rem,1fr)_3.5rem]';
const GRADE_SEM_WHATSAPP =
  'lg:grid-cols-[minmax(9rem,1.3fr)_minmax(11rem,2fr)_minmax(8rem,1.3fr)_minmax(9rem,1.4fr)_3.5rem]';

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
  /** Etiqueta do lead no CRM que move o lead para esta etapa. */
  etiquetaCrm: string | null;
  valor: boolean;
}

function doMapeamento(m: ConversionMapping | undefined): Rascunho {
  return {
    evento: m ? (m.meta_event_name ?? SO_MEDIR) : NENHUM,
    etiqueta: m?.whatsapp_label ?? null,
    etiquetaCrm: m?.crm_tag ?? null,
    valor: m?.send_deal_value ?? false,
  };
}

/** Texto de etiqueta para comparar: o campo guarda o que foi digitado, o banco guarda aparado. */
const norm = (v: string | null) => (v ?? '').trim();
/** Chave para achar etiqueta repetida: sem espaço nas pontas e sem diferenciar maiúscula. */
const chaveDaTag = (v: string | null) => norm(v).toLowerCase();

const mandaEvento = (r: Rascunho | undefined) =>
  Boolean(r) && r!.evento !== NENHUM && r!.evento !== SO_MEDIR;

/**
 * O que cada degrau do funil significa para a mídia.
 *
 * Grava por lote, não a cada clique: montar um funil são sete decisões que se
 * comparam entre si — "qual destes é o corte?" é pergunta sobre o conjunto.
 * Salvar linha a linha publicava meio funil enquanto a pessoa ainda pensava.
 */
export function ConversionSettingsTable({
  companyId, onClose, onSujoChange,
}: {
  companyId: string;
  /** Fechar o diálogo inteiro, do botão Cancelar. */
  onClose?: () => void;
  /** Avisa quem hospeda o diálogo se há alteração não salva, para não fechar perdendo trabalho. */
  onSujoChange?: (sujo: boolean) => void;
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
  const [confirmandoAoVivo, setConfirmandoAoVivo] = useState(false);
  const [forcarWhatsapp, setForcarWhatsapp] = useState(false);

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
      if (
        base.evento !== r.evento
        || norm(base.etiqueta) !== norm(r.etiqueta)
        || norm(base.etiquetaCrm) !== norm(r.etiquetaCrm)
        || base.valor !== r.valor
      ) ids.push(id);
    }
    return ids;
  }, [rascunho, salvo]);

  const sujo = alterados.length > 0;
  useEffect(() => {
    onSujoChange?.(sujo);
    return () => onSujoChange?.(false);
  }, [sujo, onSujoChange]);

  const lista = useMemo(() => stages.data ?? [], [stages.data]);

  /**
   * A etiqueta do WhatsApp só existe na conexão por QR code. Quando a empresa já não a tem (a
   * consulta falha) e nenhuma etapa usa etiqueta, a coluna vira cinco campos vazios que tiram
   * largura do que importa. Ela some, e o painel lateral diz por quê e oferece trazer de volta.
   */
  const listaEtiquetas = etiquetas.data?.etiquetas ?? [];
  const semEtiquetas = etiquetas.data && !etiquetas.data.ok;
  const algumaEtiquetaWa = lista.some((s) => norm(salvo.get(s.id)?.etiqueta ?? null) !== ''
    || norm(rascunho.get(s.id)?.etiqueta ?? null) !== '');
  const mostrarWhatsapp = etiquetas.data !== undefined
    && (!semEtiquetas || algumaEtiquetaWa || forcarWhatsapp);
  const grade = mostrarWhatsapp ? GRADE_COM_WHATSAPP : GRADE_SEM_WHATSAPP;

  /** Etiqueta do CRM repetida: o banco só aceita uma etapa por etiqueta, e o erro viria no meio do lote. */
  const erroCrmPorEtapa = useMemo(() => {
    const porTag = new Map<string, Stage[]>();
    for (const s of lista) {
      const r = rascunho.get(s.id);
      const k = chaveDaTag(r?.etiquetaCrm ?? null);
      if (!r || r.evento === NENHUM || !k) continue;
      porTag.set(k, [...(porTag.get(k) ?? []), s]);
    }
    const erros = new Map<string, string>();
    for (const etapas of porTag.values()) {
      if (etapas.length < 2) continue;
      for (const e of etapas) {
        const outras = etapas.filter((o) => o.id !== e.id).map((o) => o.name).join(', ');
        erros.set(e.id, `Já leva a ${outras}`);
      }
    }
    return erros;
  }, [lista, rascunho]);
  const temErro = erroCrmPorEtapa.size > 0;

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
          crmTag: r.etiquetaCrm,
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

  const emEnsaio = ensaio.data === true;
  const etapasQueEnviam = lista.filter((s) => mandaEvento(salvo.get(s.id))).length;
  const nenhumMapeado = lista.every((s) => !mandaEvento(rascunho.get(s.id)));

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
   * Conselho fixo é decoração: ele diz a mesma coisa para quem acertou e para quem errou. As
   * regras abaixo são verificáveis com os dados que já estão aqui, então ficam verdes quando
   * valem e âmbar quando não — nomeando as etapas envolvidas. A ordem errada também marca a
   * LINHA, para a pessoa não ter de procurar de qual etapa o aviso fala.
   */
  const analise = useMemo(() => {
    const comEvento = lista
      .map((s) => ({ etapa: s, r: rascunho.get(s.id) }))
      .filter((x): x is { etapa: Stage; r: Rascunho } => mandaEvento(x.r));

    const porNome = new Map<string, string[]>();
    for (const x of comEvento) porNome.set(x.r.evento, [...(porNome.get(x.r.evento) ?? []), x.etapa.name]);
    const repetidos = [...porNome.entries()].filter(([, e]) => e.length > 1);

    const foraDeOrdem: Stage[] = [];
    let maior = -1;
    for (const x of comEvento) {
      const d = profundidadeDoEvento(x.r.evento);
      if (d === -1) continue;
      if (d < maior) foraDeOrdem.push(x.etapa); else maior = d;
    }

    const valorForaDeVenda = comEvento
      .filter((x) => x.r.valor && x.etapa.kind !== 'won')
      .map((x) => x.etapa.name);

    return {
      foraDeOrdemIds: new Set(foraDeOrdem.map((e) => e.id)),
      praticas: [
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
          ruim: `${foraDeOrdem.map((e) => e.name).join(', ')} aponta para um evento mais raso que o de uma etapa anterior.`,
        },
        {
          ok: repetidos.length === 0,
          bom: 'Cada degrau manda um evento diferente.',
          ruim: repetidos.map(([ev, et]) => `${et.join(' e ')} mandam ${ev}`).join('; ')
            + '. Aí sim o mesmo lead conta duas vezes.',
        },
      ],
    };
  }, [lista, rascunho]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pb-5 pr-1">
          <FaixaDeEnsaio
            ligado={emEnsaio}
            ocupado={ensaio.isLoading || trocarEnsaio.isPending}
            // Ligar o ensaio é sempre seguro. Desligar manda conversão de verdade para as
            // plataformas de anúncio e não tem desfazer: pede confirmação.
            aoTrocar={(v) => (v ? trocarEnsaio.mutate(true) : setConfirmandoAoVivo(true))}
          />

          {/* Funil sem nenhum degrau mapeado é a tela mais importante e a mais
              muda: sete selects em "Não é conversão" não dizem por onde
              começar. O atalho vem para cima, onde o olho está. */}
          {lista.length > 0 && nenhumMapeado && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-foreground/15 px-5 py-4">
              <div className="text-sm">
                <p className="font-medium">Nenhum degrau avisa a Meta ainda</p>
                <p className="mt-0.5 text-muted-foreground">
                  Comece pela sugestão e ajuste o que não encaixar no seu nicho.
                </p>
              </div>
              <Button type="button" onClick={sugerir}>
                <RotateCcw className="h-4 w-4" />
                <span className="ml-2">Sugerir pelo funil</span>
              </Button>
            </div>
          )}

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">
              {/* Cabeçalho das colunas preso ao topo da rolagem: sem ele, depois de rolar, os
                  campos ficavam sem título e "Digite o nome" não dizia de qual etiqueta era.
                  `items-end` e quebra de linha permitida: um título comprido não pode cortar. */}
              <div
                className={`sticky top-0 z-10 hidden items-end gap-x-4 bg-[var(--superficie-tonal)] px-5 pb-3 pt-1 text-[11px] shadow-[0_8px_8px_-8px_rgb(15_23_42/0.10)] font-semibold uppercase tracking-wide text-muted-foreground lg:grid ${grade}`}
              >
                <span>Etapa do funil</span>
                <span>O que significa</span>
                <span className="flex items-center gap-1">
                  <span>Evento na Meta</span>
                  <Dica texto="O nome exato que a Meta recebe. É por ele que você escolhe a meta de otimização no Gerenciador de Anúncios." />
                </span>
                {mostrarWhatsapp && <span className="leading-tight">Etiqueta no WhatsApp</span>}
                <span className="flex items-end gap-1">
                  <span className="leading-tight">Etiqueta no CRM</span>
                  <Dica texto="Aplicar esta etiqueta no lead (pela tela do lead, por uma automação ou pelo formulário) move o lead para esta etapa, e a conversão sai da mudança de etapa. Só avança: etiqueta de etapa anterior não faz o lead voltar." />
                </span>
                <span className="flex items-center gap-1">
                  <span>Valor</span>
                  <Dica texto="Manda o valor da venda junto do evento. Só faz sentido na etapa de fechamento: valor num degrau de lead ensina a Meta a otimizar pela métrica errada." />
                </span>
              </div>

              <ul className="space-y-2.5">
                {lista.map((s) => (
                  <LinhaDaEtapa
                    key={s.id}
                    etapa={s}
                    grade={grade}
                    mostrarWhatsapp={mostrarWhatsapp}
                    rascunho={rascunho.get(s.id) ?? doMapeamento(undefined)}
                    alterada={alterados.includes(s.id)}
                    escrevendo={escrevendo.has(s.id)}
                    foraDeOrdem={analise.foraDeOrdemIds.has(s.id)}
                    erroCrm={erroCrmPorEtapa.get(s.id) ?? null}
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
              praticas={analise.praticas}
              whatsappOculto={Boolean(semEtiquetas) && !mostrarWhatsapp}
              whatsappIndisponivel={Boolean(semEtiquetas) && mostrarWhatsapp}
              motivo={etiquetas.data?.motivo ?? undefined}
              aoMostrarWhatsapp={() => setForcarWhatsapp(true)}
            />
          </div>
        </div>

        {/* Barra de ações. Fixa no rodapé porque a decisão de gravar é sobre o
            conjunto inteiro, e ela não pode sumir enquanto se rola a lista. */}
        <div className="-mx-5 flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t bg-background px-5 py-3 sm:-mx-8 sm:px-8 sm:py-4">
          {/* No celular a barra tem uma fileira só: "Sugerir" vira ícone (o atalho grande no topo da
              lista cobre quem está começando do zero). */}
          <Button
            type="button" variant="outline" onClick={sugerir} disabled={gravar.isPending}
            aria-label="Sugerir pelo funil"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="ml-2 hidden sm:inline">Sugerir pelo funil</span>
          </Button>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
            {temErro ? (
              <span className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
                <AlertTriangle className="h-4 w-4" />
                Há etiquetas repetidas: cada etiqueta leva a uma etapa só.
              </span>
            ) : sujo ? (
              <span className="flex items-center gap-2 text-sm text-[var(--aviso)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--aviso)]" aria-hidden />
                {alterados.length === 1 ? '1 alteração não salva' : `${alterados.length} alterações não salvas`}
              </span>
            ) : null}
            <Button
              type="button" variant="ghost"
              onClick={() => { setRascunho(new Map(salvo)); onClose?.(); }}
              disabled={gravar.isPending}
            >
              {sujo ? 'Descartar' : 'Cancelar'}
            </Button>
            <Button
              type="button"
              onClick={() => gravar.mutate()}
              disabled={!sujo || temErro || gravar.isPending}
            >
              <Save className="h-4 w-4" />
              <span className="ml-2">
                {gravar.isPending ? 'Salvando…' : (
                  <>
                    <span className="sm:hidden">Salvar</span>
                    <span className="hidden sm:inline">Salvar configurações</span>
                  </>
                )}
              </span>
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmandoAoVivo} onOpenChange={setConfirmandoAoVivo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar conversões de verdade?</AlertDialogTitle>
            <AlertDialogDescription>
              {etapasQueEnviam > 0
                ? `${etapasQueEnviam === 1 ? '1 etapa configurada passa' : `${etapasQueEnviam} etapas configuradas passam`} a mandar conversão real para a Meta e o Google. `
                : 'Nenhuma etapa está configurada para enviar, então por enquanto nada sairia. '}
              Isso entra na otimização das campanhas e não tem como desfazer o que já foi enviado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar em ensaio</AlertDialogCancel>
            <AlertDialogAction onClick={() => trocarEnsaio.mutate(false)}>
              Enviar de verdade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3.5 sm:gap-5 sm:px-5 sm:py-4 ${
        ligado
          ? 'border-[var(--aviso-borda)] bg-[var(--aviso-suave)]'
          : 'border-[var(--sucesso-borda)] bg-[var(--sucesso-suave)]'
      }`}
    >
      <div className="flex items-start gap-3">
        {ligado
          ? <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--aviso)]" />
          : <Radio className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sucesso)]" />}
        <div className="space-y-1 text-sm">
          <p className="font-medium">{ligado ? 'Modo de ensaio ligado' : 'Enviando de verdade'}</p>
          {/* Duas versões do texto: no celular só o que decide ("nada sai"), porque a faixa inteira
              chegava a sete linhas e empurrava a lista para fora da tela. */}
          <p className="max-w-[60ch] text-muted-foreground sm:hidden">
            {ligado ? 'Nada é enviado à Meta nem ao Google.' : 'Conversões reais entram na campanha.'}
          </p>
          <p className="hidden max-w-[60ch] text-muted-foreground sm:block">
            {ligado
              ? 'As etapas montam o evento e registram o que teria sido enviado, mas nada chega na Meta nem no Google. A etiqueta no WhatsApp continua sendo aplicada.'
              : 'Cada etapa configurada manda conversão real, e isso entra na otimização da campanha.'}
          </p>
        </div>
      </div>
      <label className="flex shrink-0 cursor-pointer items-center gap-2.5 text-xs font-medium text-muted-foreground">
        <span className="hidden sm:inline">{ligado ? 'Ensaio' : 'Ao vivo'}</span>
        <Switch checked={ligado} disabled={ocupado} onCheckedChange={aoTrocar} aria-label="Modo de ensaio" />
      </label>
    </div>
  );
}

function LinhaDaEtapa({
  etapa, grade, mostrarWhatsapp, rascunho, alterada, escrevendo, foraDeOrdem, erroCrm,
  etiquetasDisponiveis, aoMudar, aoEscrever,
}: {
  etapa: Stage;
  grade: string;
  mostrarWhatsapp: boolean;
  rascunho: Rascunho;
  alterada: boolean;
  escrevendo: boolean;
  foraDeOrdem: boolean;
  erroCrm: string | null;
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
      className={`grid gap-x-4 gap-y-3.5 rounded-2xl bg-[var(--superficie-cartao)] p-4 shadow-[var(--elevacao-1)] transition-shadow sm:p-5 lg:items-start ${grade} ${
        alterada ? 'ring-1 ring-[var(--selecao-anel)]' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: etapa.color }} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={etapa.name}>{etapa.name}</p>
          {/* Preso em duas linhas: a explicação de "Qualificado" ocupava quatro
              e fazia a linha ficar 2,5× mais alta que a de "Novo lead". Coluna
              com altura irregular não se varre com o olho — e varrer é o que
              se faz aqui, comparando os degraus entre si. */}
          <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground" title={explica}>
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
          <SelectTrigger className="h-10 w-full" aria-label={`O que a etapa ${etapa.name} significa`}>
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
        {foraDeOrdem && (
          <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--aviso)]">
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
            Evento mais raso que o de uma etapa anterior
          </p>
        )}
      </div>

      <div className="min-w-0 space-y-1.5">
        <Rotulo>Evento na Meta</Rotulo>
        {noSelect === EVENTO_PERSONALIZADO ? (
          // Controlado, e não confirmado ao sair do campo: com o botão Salvar desabilitado até
          // o estado mudar, o primeiro clique nele só tirava o foco do campo e se perdia.
          <Input
            value={personalizado ? rascunho.evento : ''}
            placeholder="ContratoEnviado"
            className="h-10 font-mono text-xs"
            aria-label={`Nome do evento personalizado da etapa ${etapa.name}`}
            onChange={(ev) => {
              // Sem espaço e sem acento: é um identificador que vai para a API
              // da Meta, não um rótulo de tela.
              const nome = ev.target.value
                .normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/[^A-Za-z0-9_]/g, '');
              if (nome) { aoEscrever(false); aoMudar({ evento: nome }); }
              else { aoEscrever(true); aoMudar({ evento: NENHUM, valor: false }); }
            }}
          />
        ) : envia ? (
          // Neutro: o nome do evento é dado, não ação nem seleção, e o acento é de quem marca
          // "isto está sendo editado".
          <span
            className="flex h-10 min-w-0 items-center gap-1.5 rounded-lg bg-muted px-2.5 font-mono text-xs text-foreground"
            title={rascunho.evento}
          >
            <Code2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{rascunho.evento}</span>
          </span>
        ) : (
          <span className="inline-flex h-10 items-center px-1 text-xs text-muted-foreground">—</span>
        )}
      </div>

      {mostrarWhatsapp && (
        <div className="min-w-0 space-y-1.5">
          <Rotulo>Etiqueta no WhatsApp</Rotulo>
          {etiquetasDisponiveis.length > 0 ? (
            <Select
              value={rascunho.etiqueta || SEM_ETIQUETA}
              onValueChange={(v) => aoMudar({ etiqueta: v === SEM_ETIQUETA ? null : v })}
            >
              <SelectTrigger className="h-10 w-full" aria-label={`Etiqueta do WhatsApp da etapa ${etapa.name}`}>
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
            // Sem lista para escolher, o campo de texto fica: a etiqueta digitada funciona.
            <Input
              value={rascunho.etiqueta ?? ''}
              placeholder="Digite o nome"
              className="h-10 w-full"
              aria-label={`Etiqueta do WhatsApp da etapa ${etapa.name}`}
              onChange={(e) => aoMudar({ etiqueta: e.target.value || null })}
            />
          )}
        </div>
      )}

      <div className="min-w-0 space-y-1.5">
        <Rotulo>Etiqueta no CRM</Rotulo>
        {/* Só com evento (ou "Só medir"): uma linha de mapeamento define a etapa como conversão
            nos relatórios, então a etiqueta não pode criar essa linha sozinha. */}
        <Input
          value={rascunho.evento === NENHUM ? '' : (rascunho.etiquetaCrm ?? '')}
          placeholder={rascunho.evento === NENHUM ? 'Escolha o evento antes' : 'Ex.: qualificado'}
          disabled={rascunho.evento === NENHUM}
          maxLength={60}
          className="h-10 w-full"
          aria-label={`Etiqueta do CRM que leva à etapa ${etapa.name}`}
          aria-invalid={erroCrm ? true : undefined}
          onChange={(e) => aoMudar({ etiquetaCrm: e.target.value || null })}
        />
        {erroCrm && (
          <p className="text-[11px] leading-snug text-destructive" role="alert">{erroCrm}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Rotulo>Valor</Rotulo>
        {/* Valor só existe quando há para onde enviar, e só faz sentido na
            etapa de fechamento: valor em evento de lead ensina a Meta a
            otimizar pela métrica errada. */}
        {envia ? (
          <div className="flex h-10 items-center">
            <Switch
              checked={rascunho.valor}
              onCheckedChange={(v) => aoMudar({ valor: v })}
              aria-label={`Mandar valor da venda na etapa ${etapa.name}`}
            />
          </div>
        ) : (
          <p className="flex h-10 items-center text-xs text-muted-foreground">—</p>
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
  praticas, whatsappOculto, whatsappIndisponivel, motivo, aoMostrarWhatsapp,
}: {
  praticas: Array<{ ok: boolean; bom: string; ruim: string }>;
  /** A consulta das etiquetas do WhatsApp falhou e a coluna foi escondida. */
  whatsappOculto: boolean;
  /** A consulta falhou, mas a coluna está visível (há etiqueta configurada ou foi pedida). */
  whatsappIndisponivel: boolean;
  motivo: string | undefined;
  aoMostrarWhatsapp: () => void;
}) {
  return (
    // Preso ao topo da rolagem (só onde fica ao lado da lista): as conferências precisam estar à
    // vista enquanto se edita a linha lá embaixo. Sem borda e sem cartão dentro de cartão.
    <aside className="space-y-5 rounded-2xl bg-[var(--superficie-cartao)] p-5 shadow-[var(--elevacao-1)] xl:sticky xl:top-0">
      <div className="flex items-start gap-2.5">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold">Boas práticas</p>
          <p className="text-xs text-muted-foreground">conferidas no que está na tela</p>
        </div>
      </div>

      <ul className="space-y-3">
        {praticas.map((p) => (
          <li key={p.bom} className="flex items-start gap-2.5 text-xs leading-snug">
            {p.ok
              ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--sucesso)]" />
              : <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--aviso)]" />}
            <span className={p.ok ? 'text-muted-foreground' : 'text-foreground'}>
              {p.ok ? p.bom : p.ruim}
            </span>
          </li>
        ))}
        {whatsappIndisponivel && (
          <li className="flex items-start gap-2.5 text-xs leading-snug">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--aviso)]" />
            <span>
              Não deu para listar as etiquetas do WhatsApp{motivo ? ` (${motivo})` : ''}. Dá para
              digitar o nome, mas confira a grafia.
            </span>
          </li>
        )}
        {whatsappOculto && (
          <li className="flex items-start gap-2.5 text-xs leading-snug text-muted-foreground">
            <Info className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              A coluna de etiqueta do WhatsApp está oculta: a conexão por QR code não está ativa.{' '}
              <button
                type="button"
                onClick={aoMostrarWhatsapp}
                className="font-medium text-foreground underline underline-offset-4 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Mostrar mesmo assim
              </button>
            </span>
          </li>
        )}
      </ul>

      <div className="space-y-2 border-t pt-5">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
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
