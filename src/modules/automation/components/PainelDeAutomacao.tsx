import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Zap, Plus, Pencil, Trash2, ArrowRight, Tag, MoveRight, UserCheck,
  MessageSquare, Webhook,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { listStages } from '@/modules/crm/services/stageService';
import { listarMembrosDaEquipe } from '@/modules/crm/services/teamService';
import {
  ACOES, EVENTOS, OPERADORES, automationService, type Regra,
} from '../services/automationService';
import { RegraDialog } from './RegraDialog';

export function PainelDeAutomacao() {
  const { company } = useAuth();
  const companyId = company?.id;
  const qc = useQueryClient();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Regra | null>(null);

  const { data: regras, isLoading } = useQuery({
    queryKey: ['automation-rules', companyId],
    queryFn: () => automationService.listarRegras(companyId!),
    enabled: !!companyId,
  });

  const { data: etapas } = useQuery({
    queryKey: ['stages', companyId],
    queryFn: () => listStages(companyId!),
    enabled: !!companyId,
  });

  const { data: equipe } = useQuery({
    queryKey: ['equipe', companyId],
    queryFn: () => listarMembrosDaEquipe(companyId!),
    enabled: !!companyId,
  });

  const { data: execucoes } = useQuery({
    queryKey: ['automation-jobs', companyId],
    queryFn: () => automationService.listarExecucoes(companyId!, 25),
    enabled: !!companyId,
    // A fila roda de minuto em minuto no servidor; olhar mais que isso é ruído.
    refetchInterval: 60_000,
  });

  const alternar = useMutation({
    mutationFn: ({ id, ativa }: { id: string; ativa: boolean }) =>
      automationService.alternarAtiva(id, ativa),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules', companyId] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível alterar.'),
  });

  const excluir = useMutation({
    mutationFn: (id: string) => automationService.excluirRegra(id),
    onSuccess: () => {
      toast.success('Regra excluída.');
      qc.invalidateQueries({ queryKey: ['automation-rules', companyId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível excluir.'),
  });

  if (!companyId) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">Automação</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            O gatilho enfileira no banco e o servidor executa — vale para lead de qualquer origem.
          </p>
        </div>
        <Button className="gap-2" onClick={() => { setEmEdicao(null); setDialogAberto(true); }}>
          <Plus className="h-4 w-4" /> Nova regra
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-[20px]" />)}
        </div>
      ) : !regras?.length ? (
        <div className="cartao">
          <div className="cartao-corpo flex flex-col items-center gap-3 py-14 text-center">
            <span className="disco h-11 w-11"><Zap className="h-5 w-5" /></span>
            <div>
              <h3 className="text-[15px] font-semibold">Nenhuma regra ainda</h3>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">
                Uma regra tem um gatilho, condições opcionais e ações. Exemplo: lead com
                score acima de 60 recebe a etiqueta “quente” e vai para o corretor.
              </p>
            </div>
            <Button variant="outline" className="mt-1 gap-2"
              onClick={() => { setEmEdicao(null); setDialogAberto(true); }}>
              <Plus className="h-4 w-4" /> Criar a primeira
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {regras.map((r) => (
            <CartaoDaRegra
              key={r.id} regra={r}
              etapas={etapas ?? []} equipe={equipe ?? []}
              onEditar={() => { setEmEdicao(r); setDialogAberto(true); }}
              onAlternar={(ativa) => alternar.mutate({ id: r.id, ativa })}
              onExcluir={() => excluir.mutate(r.id)}
            />
          ))}
        </div>
      )}

      <div className="cartao">
        <div className="cartao-topo">
          <span className="disco"><ArrowRight className="h-4 w-4" /></span>
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold leading-tight">Últimas execuções</h2>
            <p className="text-[11px] text-muted-foreground">
              A fila é processada de minuto em minuto. Falha é repetida até 4 vezes.
            </p>
          </div>
        </div>
        <div className="cartao-corpo">
          {!execucoes?.length ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              Nada executado ainda.
            </p>
          ) : (
            <div className="divide-y divide-[var(--linha-sutil)]">
              {execucoes.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                  <SeloDeStatus status={e.status} />
                  <span className="text-[13px] font-medium">{e.regra}</span>
                  <span className="text-[12px] text-muted-foreground">
                    {EVENTOS.find((v) => v.valor === e.evento)?.rotulo ?? e.evento}
                  </span>
                  {e.lead_nome && (
                    <span className="text-[12px] text-muted-foreground">· {e.lead_nome}</span>
                  )}
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                    {new Date(e.criado_em).toLocaleString('pt-BR')}
                  </span>
                  {e.erro && (
                    <p className="w-full text-[11px] text-[var(--destructive)]">
                      tentativa {e.tentativas}: {e.erro}
                    </p>
                  )}
                  {!e.erro && e.resultado?.length ? (
                    <p className="w-full text-[11px] text-muted-foreground">
                      {e.resultado.map((r) => `${r.acao}: ${r.status}${r.detalhe ? ` (${r.detalhe})` : ''}`).join(' · ')}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <RegraDialog
        aberto={dialogAberto} onFechar={() => setDialogAberto(false)}
        companyId={companyId} regra={emEdicao}
        etapas={etapas ?? []} equipe={equipe ?? []}
        onSalvo={() => qc.invalidateQueries({ queryKey: ['automation-rules', companyId] })}
      />
    </div>
  );
}

const ICONE_DA_ACAO: Record<string, typeof Tag> = {
  etiquetar: Tag,
  mover_etapa: MoveRight,
  atribuir_responsavel: UserCheck,
  enviar_whatsapp: MessageSquare,
  webhook: Webhook,
};

function CartaoDaRegra({
  regra, etapas, equipe, onEditar, onAlternar, onExcluir,
}: {
  regra: Regra;
  etapas: Array<{ id: string; name: string }>;
  equipe: Array<{ userId: string; nome: string }>;
  onEditar: () => void;
  onAlternar: (ativa: boolean) => void;
  onExcluir: () => void;
}) {
  const acoes = (regra.automation_actions ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);

  const resumoDaAcao = (tipo: string, cfg: Record<string, any>) => {
    switch (tipo) {
      case 'etiquetar':
        return (cfg.etiquetas ?? []).join(', ') || 'sem etiqueta';
      case 'mover_etapa':
        return etapas.find((s) => s.id === cfg.stage_id)?.name ?? 'etapa não escolhida';
      case 'atribuir_responsavel':
        return equipe.find((m) => m.userId === cfg.user_id)?.nome ?? 'ninguém escolhido';
      case 'enviar_whatsapp':
        return cfg.para ? `para ${cfg.para}` : 'para o lead';
      case 'webhook':
        return cfg.url || 'url não preenchida';
      default:
        return '';
    }
  };

  return (
    <div className="cartao">
      <div className="cartao-topo">
        <span className={`disco ${regra.is_active ? 'disco-acento' : ''}`}>
          <Zap className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[13px] font-semibold leading-tight">{regra.name}</h3>
          <p className="text-[11px] text-muted-foreground">
            {EVENTOS.find((e) => e.valor === regra.trigger_event)?.rotulo ?? regra.trigger_event}
            {regra.priority !== 0 && ` · prioridade ${regra.priority}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Switch checked={regra.is_active} onCheckedChange={onAlternar} />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEditar}>
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onExcluir}>
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="cartao-corpo grid gap-4 @container sm:grid-cols-[1fr_auto_1.2fr]">
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Se</p>
          {regra.conditions.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">sem condição — vale sempre</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {regra.conditions.map((c, i) => (
                <Badge key={i} variant="secondary" className="font-normal">
                  {c.campo} {OPERADORES.find((o) => o.valor === c.operador)?.rotulo ?? c.operador}
                  {c.valor ? ` ${c.valor}` : ''}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="hidden items-center sm:flex">
          <ArrowRight className="h-4 w-4 text-muted-foreground/40" />
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Então</p>
          {acoes.length === 0 ? (
            <p className="text-[13px] text-[var(--aviso)]">nenhuma ação — nada vai acontecer</p>
          ) : (
            <ul className="space-y-1">
              {acoes.map((a, i) => {
                const Icone = ICONE_DA_ACAO[a.action_type] ?? Zap;
                return (
                  <li key={i} className="flex items-center gap-2 text-[13px]">
                    <Icone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">
                      {ACOES.find((o) => o.valor === a.action_type)?.rotulo ?? a.action_type}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {resumoDaAcao(a.action_type, a.config ?? {})}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SeloDeStatus({ status }: { status: string }) {
  const mapa: Record<string, { rotulo: string; cor: string }> = {
    pending: { rotulo: 'na fila', cor: 'text-muted-foreground' },
    running: { rotulo: 'rodando', cor: 'text-[var(--aviso)]' },
    done: { rotulo: 'feito', cor: 'text-[var(--sucesso)]' },
    failed: { rotulo: 'falhou', cor: 'text-[var(--destructive)]' },
  };
  const s = mapa[status] ?? { rotulo: status, cor: 'text-muted-foreground' };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${s.cor}`}>
      {s.rotulo}
    </span>
  );
}
