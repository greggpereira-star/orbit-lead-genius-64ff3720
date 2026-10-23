import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listarCampos } from '@/modules/crm/services/customFieldService';
import { variavelDaAutomacao } from '@/modules/crm/lib/camposPersonalizados';
import { toast } from 'sonner';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ACOES, CAMPOS_POR_EVENTO, EVENTOS, OPERADORES, aceitaHorarioComercial, erroDosMinutos, precisaDeMinutos, MINUTOS_MAX, MINUTOS_MIN,
  automationService, type Acao, type Condicao, type Regra,
} from '../services/automationService';
import type { Stage } from '@/modules/crm/services/stageService';
import type { MembroDaEquipe } from '@/modules/crm/services/teamService';
import { useTemplatesAprovados } from '@/modules/atendimento/hooks/useAtendimento';

/** Operadores que não pedem valor — pedir seria um campo que não faz nada. */
const SEM_VALOR = new Set(['preenchido', 'vazio']);

interface Props {
  aberto: boolean;
  onFechar: () => void;
  companyId: string;
  regra: Regra | null;
  etapas: Stage[];
  equipe: MembroDaEquipe[];
  onSalvo: () => void;
}

export function RegraDialog({ aberto, onFechar, companyId, regra, etapas, equipe, onSalvo }: Props) {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [evento, setEvento] = useState<string>('lead_created');
  const [minutos, setMinutos] = useState<string>('30');
  const [soExpediente, setSoExpediente] = useState(false);
  const [prioridade, setPrioridade] = useState(0);
  const [ativa, setAtiva] = useState(true);
  const [condicoes, setCondicoes] = useState<Condicao[]>([]);
  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setNome(regra?.name ?? '');
    setDescricao(regra?.descricao ?? '');
    setEvento(regra?.trigger_event ?? 'lead_created');
    setMinutos(String(regra?.trigger_config?.minutos ?? 30));
    setSoExpediente(Boolean(regra?.trigger_config?.horario_comercial));
    setPrioridade(regra?.priority ?? 0);
    setAtiva(regra?.is_active ?? true);
    setCondicoes(regra?.conditions ?? []);
    setAcoes(
      (regra?.automation_actions ?? [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((a) => ({ action_type: a.action_type, config: a.config ?? {}, sort_order: a.sort_order })),
    );
  }, [aberto, regra]);

  // Os campos personalizados da empresa também servem de condição e de {{variável}} (cf_<chave>).
  const personalizados = useQuery({
    queryKey: ['custom-field-defs', companyId],
    enabled: aberto && Boolean(companyId),
    queryFn: () => listarCampos(companyId),
    staleTime: 60_000,
  });
  const campos = useMemo(
    () => [
      ...(CAMPOS_POR_EVENTO[evento] ?? []),
      ...(personalizados.data ?? []).map((d) => variavelDaAutomacao(d.key)),
    ],
    [evento, personalizados.data],
  );

  /* Trocar o evento invalida as condições: os campos de `lead_created` não
     existem em `form_abandoned`, e uma condição sobre campo inexistente nunca
     casa — a regra ficaria na tela parecendo configurada e nunca rodaria. */
  const trocarEvento = (novo: string) => {
    setEvento(novo);
    setCondicoes((atuais) => atuais.filter((c) => c.campo.startsWith('cf_') || (CAMPOS_POR_EVENTO[novo] ?? []).includes(c.campo)));
  };

  const salvar = async () => {
    if (!nome.trim()) return toast.error('Dê um nome à regra.');
    if (!acoes.some((a) => a.action_type)) return toast.error('Uma regra sem ação não faz nada. Adicione ao menos uma.');
    if (precisaDeMinutos(evento)) {
      const erro = erroDosMinutos(minutos);
      if (erro) return toast.error(erro);
    }

    setSalvando(true);
    try {
      await automationService.salvarRegra({
        id: regra?.id,
        companyId, name: nome, descricao, trigger_event: evento,
        conditions: condicoes, minutos: precisaDeMinutos(evento) ? Number(minutos) : null,
        horarioComercial: aceitaHorarioComercial(evento) && soExpediente,
        priority: prioridade, is_active: ativa, acoes,
      });
      toast.success(regra ? 'Regra atualizada.' : 'Regra criada.');
      onSalvo();
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="sm:max-w-[720px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-[-0.01em]">
            {regra ? 'Editar regra' : 'Nova regra'}
          </DialogTitle>
          <DialogDescription>
            Quando o gatilho acontecer e as condições baterem, as ações rodam na ordem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="grid gap-4 @container sm:grid-cols-[1fr_8rem]">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Lead quente vai direto para o corretor" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">Prioridade</Label>
              <Input type="number" value={prioridade}
                onChange={(e) => setPrioridade(Number(e.target.value) || 0)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Observação</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)}
              rows={2} placeholder="Para que esta regra existe (opcional)" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground">Gatilho</Label>
            <Select value={evento} onValueChange={trocarEvento}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENTOS.map((e) => (
                  <SelectItem key={e.valor} value={e.valor}>{e.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {EVENTOS.find((e) => e.valor === evento)?.ajuda}
            </p>
            {precisaDeMinutos(evento) && (
              <div className="flex items-center gap-2 pt-1">
                <Label htmlFor="regra-minutos" className="text-xs font-semibold text-muted-foreground">
                  {evento === 'window_expiring' ? 'Avisar quando faltarem' : 'Depois de'}
                </Label>
                <Input id="regra-minutos" type="number" inputMode="numeric" className="h-9 w-24"
                  min={MINUTOS_MIN} max={MINUTOS_MAX} value={minutos}
                  onChange={(e) => setMinutos(e.target.value)} />
                <span className="text-xs text-muted-foreground">
                  minutos ({MINUTOS_MIN} a {MINUTOS_MAX})
                </span>
              </div>
            )}
            {aceitaHorarioComercial(evento) && (
              <div className="flex items-start gap-2 pt-1.5">
                <Switch id="regra-expediente" checked={soExpediente} onCheckedChange={setSoExpediente} />
                <div>
                  <Label htmlFor="regra-expediente" className="text-xs font-semibold text-muted-foreground">
                    Contar só o horário de atendimento
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Noites, fins de semana e feriados não entram na contagem (Configurações → Horário de
                    atendimento). Desligado, conta em horário corrido. Sem horário configurado, não muda nada.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Condições */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-muted-foreground">Condições</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
                onClick={() => setCondicoes((c) => [...c, { campo: campos[0] ?? '', operador: 'igual', valor: '' }])}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
            {condicoes.some((c) => c.campo === 'dentro_do_horario') && (
              <p className="text-[11px] text-muted-foreground">
                <b>dentro_do_horario</b>: use <b>false</b> para agir fora do horário de atendimento e{' '}
                <b>true</b> para agir dentro dele. O horário se configura em Configurações → Horário de
                atendimento; sem horário configurado, vale sempre <b>true</b>.
              </p>
            )}
            {condicoes.length === 0 ? (
              <p className="rounded-xl bg-[var(--poco)] px-3.5 py-3 text-[13px] text-muted-foreground">
                Sem condição: a regra vale para todo evento desse tipo.
              </p>
            ) : (
              <div className="space-y-2">
                {condicoes.map((c, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                    <Select value={c.campo}
                      onValueChange={(v) => setCondicoes((a) => a.map((x, j) => j === i ? { ...x, campo: v } : x))}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Campo" /></SelectTrigger>
                      <SelectContent>
                        {campos.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={c.operador}
                      onValueChange={(v) => setCondicoes((a) => a.map((x, j) => j === i ? { ...x, operador: v } : x))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPERADORES.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {SEM_VALOR.has(c.operador) ? <div /> : (
                      <Input className="h-9" value={c.valor ?? ''} placeholder="Valor"
                        onChange={(e) => setCondicoes((a) => a.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} />
                    )}
                    <Button type="button" variant="ghost" size="icon" className="h-9 w-9"
                      onClick={() => setCondicoes((a) => a.filter((_, j) => j !== i))}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-muted-foreground">Ações</Label>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs"
                onClick={() => setAcoes((a) => [...a, { action_type: 'etiquetar', config: {}, sort_order: a.length }])}>
                <Plus className="h-3.5 w-3.5" /> Adicionar
              </Button>
            </div>
            {acoes.length === 0 ? (
              <p className="rounded-xl bg-[var(--poco)] px-3.5 py-3 text-[13px] text-muted-foreground">
                Nenhuma ação. A regra não será salva assim.
              </p>
            ) : (
              <div className="space-y-2.5">
                {acoes.map((a, i) => (
                  <div key={i} className="rounded-xl border border-[var(--linha-sutil)] bg-[var(--poco)] p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-background text-[11px] font-semibold tabular-nums">
                        {i + 1}
                      </span>
                      <Select value={a.action_type}
                        onValueChange={(v) => setAcoes((x) => x.map((y, j) => j === i ? { ...y, action_type: v, config: {} } : y))}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ACOES.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0"
                        onClick={() => setAcoes((x) => x.filter((_, j) => j !== i))}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                    <ConfigDaAcao
                      acao={a} etapas={etapas} equipe={equipe} campos={campos} companyId={companyId}
                      onMudar={(cfg) => setAcoes((x) => x.map((y, j) => j === i ? { ...y, config: cfg } : y))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-[var(--linha-sutil)] px-3.5 py-3">
            <div>
              <p className="text-[13px] font-medium">Regra ativa</p>
              <p className="text-[11px] text-muted-foreground">Desligada, ela não enfileira nada.</p>
            </div>
            <Switch checked={ativa} onCheckedChange={setAtiva} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando} className="gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {regra ? 'Salvar' : 'Criar regra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfigDaAcao({
  acao, etapas, equipe, campos, companyId, onMudar,
}: {
  acao: Acao;
  companyId: string;
  etapas: Stage[];
  equipe: MembroDaEquipe[];
  campos: string[];
  onMudar: (cfg: Record<string, any>) => void;
}) {
  const cfg = acao.config ?? {};
  const set = (patch: Record<string, any>) => onMudar({ ...cfg, ...patch });

  switch (acao.action_type) {
    case 'etiquetar':
      return (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground">Etiquetas, separadas por vírgula</Label>
          <Input className="h-9" placeholder="lead-quente, ligar-hoje"
            value={(cfg.etiquetas ?? []).join(', ')}
            onChange={(e) => set({
              etiquetas: e.target.value.split(',').map((t) => t.trim()).filter(Boolean),
            })} />
        </div>
      );

    case 'mover_etapa':
      return (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground">Etapa de destino</Label>
          <Select value={cfg.stage_id ?? ''} onValueChange={(v) => set({ stage_id: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Escolha a etapa" /></SelectTrigger>
            <SelectContent>
              {etapas.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );

    case 'atribuir_responsavel':
      return (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground">Responsável</Label>
          <Select value={cfg.user_id ?? ''} onValueChange={(v) => set({ user_id: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Escolha quem recebe" /></SelectTrigger>
            <SelectContent>
              {equipe.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      );

    case 'enviar_whatsapp':
      return (
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-muted-foreground">
              Para — vazio envia ao telefone do próprio lead
            </Label>
            <Input className="h-9" placeholder="27999998888 (opcional)"
              value={cfg.para ?? ''} onChange={(e) => set({ para: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-muted-foreground">Mensagem</Label>
            <Textarea rows={3} value={cfg.mensagem ?? ''}
              onChange={(e) => set({ mensagem: e.target.value })}
              placeholder={'Olá {{nome}}, recebemos seu contato!'} />
            <p className="text-[11px] text-muted-foreground">
              Entre chaves duplas vira o dado do evento: {campos.map((c) => `{{${c}}}`).join('  ')}
            </p>
          </div>
        </div>
      );

    case 'enviar_template':
      return <EditorDeTemplate cfg={cfg} campos={campos} companyId={companyId} onMudar={set} />;

    case 'criar_tarefa':
      return <EditorDeTarefa cfg={cfg} campos={campos} equipe={equipe} onMudar={set} />;

    case 'resolver_conversa':
    case 'reabrir_conversa':
      return (
        <p className="text-[11px] text-muted-foreground">
          {acao.action_type === 'resolver_conversa'
            ? 'Marca a conversa do evento como resolvida. Se já estiver resolvida, não faz nada. Só vale em eventos que têm conversa (mensagem, sem resposta, janela, resolvida, atribuída).'
            : 'Reabre a conversa do evento se ela estiver resolvida. Só vale em eventos que têm conversa.'}
        </p>
      );

    case 'avaliar_atendimento':
      return (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground">Mensagem (opcional)</Label>
          <Textarea rows={2} value={cfg.mensagem ?? ''}
            placeholder="Como foi o seu atendimento? Responda com uma nota de 1 (ruim) a 5 (ótimo)."
            onChange={(e) => set({ mensagem: e.target.value })} />
          <p className="text-[11px] text-muted-foreground">
            Vai como texto simples, dentro da janela de 24h. O cliente responde só o número (1 a 5); a
            nota aparece no painel da conversa. Vale a primeira resposta, em até 48 h.
          </p>
        </div>
      );

    case 'notificar_equipe':
      return <EditorDeAviso cfg={cfg} campos={campos} equipe={equipe} onMudar={set} />;

    case 'atribuir_conversa':
      return (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground">
            Responsável — vazio usa o responsável pelo lead
          </Label>
          <Select value={cfg.user_id ?? ''} onValueChange={(v) => set({ user_id: v === '__lead__' ? '' : v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Responsável pelo lead" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__lead__">Responsável pelo lead</SelectItem>
              {equipe.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Só faz efeito em regras do evento "Mensagem recebida no WhatsApp", que é quando existe uma conversa.
          </p>
        </div>
      );

    case 'webhook':
      return (
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold text-muted-foreground">URL (https)</Label>
            <Input className="h-9" placeholder="https://hooks.exemplo.com/leadflow"
              value={cfg.url ?? ''} onChange={(e) => set({ url: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input className="h-9" placeholder="Cabeçalho (opcional)"
              value={cfg.header_nome ?? ''} onChange={(e) => set({ header_nome: e.target.value })} />
            <Input className="h-9" placeholder="Valor do cabeçalho"
              value={cfg.header_valor ?? ''} onChange={(e) => set({ header_valor: e.target.value })} />
          </div>
        </div>
      );

    default:
      return null;
  }
}

/**
 * Escolha de template e mapeamento das variáveis `{{1}}`, `{{2}}`… para dados do
 * evento (`{{nome}}`). Só aparecem templates APROVADOS: um pendente não envia.
 */
function EditorDeTemplate({
  cfg, campos, companyId, onMudar,
}: {
  cfg: Record<string, any>;
  campos: string[];
  companyId: string;
  onMudar: (patch: Record<string, any>) => void;
}) {
  const templates = useTemplatesAprovados(companyId);
  const lista = templates.data ?? [];
  // Template é da CONTA do WhatsApp. Com mais de uma conta, o mesmo nome pode existir em duas, e o
  // envio abre a conversa no número da conta escolhida aqui (`conta_wa`).
  const escolhido =
    lista.find(
      (t) =>
        t.name === cfg.template
        && t.language === (cfg.idioma ?? 'pt_BR')
        && (!cfg.conta_wa || t.account_id === cfg.conta_wa),
    ) ?? null;
  const variasContas = new Set(lista.map((t) => t.account_id).filter(Boolean)).size > 1;
  const corpo = String(
    escolhido?.components.find((c) => String(c.type).toUpperCase() === 'BODY')?.text ?? '',
  );
  const n = new Set([...corpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1])).size;
  const variaveis: Record<string, string> = cfg.variaveis ?? {};

  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-muted-foreground">Template aprovado</Label>
        <Select
          value={escolhido ? `${escolhido.name}|${escolhido.language}|${escolhido.account_id ?? ''}` : ''}
          onValueChange={(v) => {
            const [nome, idioma, conta] = v.split('|');
            onMudar({ template: nome, idioma, conta_wa: conta || undefined, variaveis: {} });
          }}
        >
          <SelectTrigger className="h-9"><SelectValue placeholder="Escolha o template" /></SelectTrigger>
          <SelectContent>
            {lista.map((t) => (
              <SelectItem key={t.id} value={`${t.name}|${t.language}|${t.account_id ?? ''}`}>
                {t.name} · {t.language}
                {variasContas && <span className="text-muted-foreground"> · {t.numero ?? 'outra conta'}</span>}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!templates.isLoading && lista.length === 0 && (
          <p className="text-[11px] text-destructive">
            Nenhum template aprovado. Crie em Configurações › WhatsApp oficial.
          </p>
        )}
      </div>

      {escolhido && (
        <>
          <p className="rounded-lg bg-muted/50 p-2.5 text-[12px] whitespace-pre-wrap">{corpo}</p>
          {Array.from({ length: n }, (_, i) => String(i + 1)).map((k) => (
            <div key={k} className="space-y-1">
              <Label className="text-[11px] font-semibold text-muted-foreground">{`Valor de {{${k}}}`}</Label>
              <Input className="h-9" placeholder="{{nome}}" value={variaveis[k] ?? ''}
                onChange={(e) => onMudar({ variaveis: { ...variaveis, [k]: e.target.value } })} />
            </div>
          ))}
          {n > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Use dados do evento: {campos.map((c) => `{{${c}}}`).join('  ')}
            </p>
          )}
        </>
      )}

      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-muted-foreground">
          Para — vazio envia ao telefone do próprio lead
        </Label>
        <Input className="h-9" placeholder="27999998888 (opcional)"
          value={cfg.para ?? ''} onChange={(e) => onMudar({ para: e.target.value })} />
      </div>
    </div>
  );
}

/** Aviso no sino da equipe: quem recebe, título e texto (com os dados do evento entre chaves duplas). */
function EditorDeAviso({
  cfg, campos, equipe, onMudar,
}: {
  cfg: Record<string, any>;
  campos: string[];
  equipe: MembroDaEquipe[];
  onMudar: (patch: Record<string, any>) => void;
}) {
  const destino = cfg.destino ?? 'responsavel';
  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-muted-foreground">Quem recebe</Label>
        <Select value={destino} onValueChange={(v) => onMudar({ destino: v })}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="responsavel">Quem está com a conversa (sem responsável, todos)</SelectItem>
            <SelectItem value="todos">Todos que atendem</SelectItem>
            <SelectItem value="usuario">Uma pessoa específica</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {destino === 'usuario' && (
        <div className="space-y-1.5">
          <Label className="text-[11px] font-semibold text-muted-foreground">Pessoa</Label>
          <Select value={cfg.user_id ?? ''} onValueChange={(v) => onMudar({ user_id: v })}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Escolha quem recebe" /></SelectTrigger>
            <SelectContent>
              {equipe.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-muted-foreground">Título (opcional)</Label>
        <Input className="h-9" value={cfg.titulo ?? ''} placeholder="Deixe vazio para o texto padrão do gatilho"
          onChange={(e) => onMudar({ titulo: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-muted-foreground">Texto (opcional)</Label>
        <Textarea rows={2} value={cfg.mensagem ?? ''}
          onChange={(e) => onMudar({ mensagem: e.target.value })} />
        <p className="text-[11px] text-muted-foreground">
          Entre chaves duplas vira o dado do evento: {campos.map((c) => `{{${c}}}`).join('  ')}
          {campos.includes('minutos_esperando') && '  {{tempo_esperando}} (ex.: 3 h 20 min)'}
          {campos.includes('minutos_restantes') && '  {{tempo_restante}} (ex.: 20 h 46 min)'}
          {campos.includes('minutos_sem_mensagem') && '  {{tempo_sem_mensagem}} (ex.: 3 h)'}
          {campos.includes('minutos_pendente') && '  {{tempo_pendente}} (ex.: 45 min)'}
        </p>
      </div>
    </div>
  );
}

/** Tarefa para o lead do evento: texto (com dados do evento), prazo em horas e quem faz. */
function EditorDeTarefa({
  cfg, campos, equipe, onMudar,
}: {
  cfg: Record<string, any>;
  campos: string[];
  equipe: MembroDaEquipe[];
  onMudar: (patch: Record<string, any>) => void;
}) {
  const destino = cfg.destino ?? 'responsavel';
  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-muted-foreground">Tarefa</Label>
        <Input className="h-9" value={cfg.texto ?? ''}
          placeholder="Retomar o contato com {{nome}}"
          onChange={(e) => onMudar({ texto: e.target.value })} />
        <p className="text-[11px] text-muted-foreground">
          Entre chaves duplas vira o dado do evento: {campos.map((c) => `{{${c}}}`).join('  ')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="tarefa-prazo" className="text-[11px] font-semibold text-muted-foreground">
          Prazo: daqui a
        </Label>
        <Input id="tarefa-prazo" type="number" inputMode="numeric" min={1} max={720}
          className="h-9 w-24" value={cfg.prazo_horas ?? 24}
          onChange={(e) => onMudar({ prazo_horas: Number(e.target.value) || 24 })} />
        <span className="text-[11px] text-muted-foreground">horas (1 a 720)</span>
      </div>
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-muted-foreground">Quem faz</Label>
        <Select value={destino} onValueChange={(v) => onMudar({ destino: v })}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="responsavel">Responsável da conversa ou do lead</SelectItem>
            <SelectItem value="usuario">Uma pessoa específica</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {destino === 'usuario' && (
        <Select value={cfg.user_id ?? ''} onValueChange={(v) => onMudar({ user_id: v })}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
          <SelectContent>
            {equipe.map((m) => <SelectItem key={m.userId} value={m.userId}>{m.nome}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <p className="text-[11px] text-muted-foreground">
        Sem responsável encontrado, a ação não cria a tarefa (ficaria sem ninguém para avisar). O aviso
        de prazo chega no sino.
      </p>
    </div>
  );
}
