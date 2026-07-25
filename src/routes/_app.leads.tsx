import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Columns3, Download, ExternalLink, Eye, Filter, Globe, Loader2, MapPin, MoreHorizontal, Plus, Search, Share2, UserPlus } from 'lucide-react';

import { LeadDetailDialog } from '@/modules/crm/components/LeadDetailDialog';
import {
  getLeadOrigin,
  getLeadCity,
  formatDateTime,
  relativeTime,
  toTitleCase,
} from '@/modules/crm/lib/leadFields';
import { listStages, type Stage } from '@/modules/crm/services/stageService';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/core/auth/hooks/useAuth';
import {
  archiveLead,
  createLead,
  getLeadDisplayName,
  getLeadScore,
  getLeadTemperature,
  getLeadCompanyName,
  listLeads,
  listMetaFormsForCompany,
  type LeadRow,
} from '@/modules/crm/services/leadService';


export const Route = createFileRoute('/_app/leads')({
  component: LeadsPage,
});

interface LeadFormState {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  source: string;
}

const INITIAL_FORM: LeadFormState = {
  name: '',
  email: '',
  phone: '',
  companyName: '',
  source: 'manual',
};

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived'];
const TEMPERATURE_OPTIONS = ['hot', 'warm', 'cold'] as const;

/**
 * Colunas da tabela.
 *
 * Temperatura e score saíram: eram preenchidos por valores fixos do
 * mapeamento, não por nenhuma avaliação real, então ocupavam espaço nobre sem
 * informar nada. No lugar entrou o que o usuário de fato precisa pra decidir
 * quem atender primeiro — de onde veio, de onde é e há quanto tempo chegou.
 *
 * A coluna "origem" mostra o nome do formulário: numa imobiliária é o
 * empreendimento, numa clínica o procedimento. Por isso o rótulo é
 * configurável em vez de fixo — o dado generaliza, a palavra não.
 */
interface ColumnDef {
  id: string;
  label: string;
  defaultVisible: boolean;
  /** Colunas essenciais não entram no seletor: sem elas a linha perde sentido. */
  locked?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { id: 'contato', label: 'Contato', defaultVisible: true, locked: true },
  { id: 'origem', label: 'Origem', defaultVisible: true },
  { id: 'canal', label: 'Canal', defaultVisible: true },
  { id: 'cidade', label: 'Cidade', defaultVisible: true },
  { id: 'status', label: 'Etapa', defaultVisible: true },
  { id: 'atribuido', label: 'Atribuído', defaultVisible: false },
  { id: 'criado', label: 'Cadastrado em', defaultVisible: true },
];

const COLS_STORAGE_KEY = 'altflow:leads:columns';

function loadVisibleColumns(): string[] {
  const fallback = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id);
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(COLS_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback;
    // Mantém só ids que ainda existem, senão uma coluna removida do código
    // deixaria a preferência salva quebrada.
    const valid = parsed.filter((id) => COLUMNS.some((c) => c.id === id));
    return valid.length ? valid : fallback;
  } catch {
    return fallback;
  }
}

function LeadsPage() {
  const { company, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [temperature, setTemperature] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [assignment, setAssignment] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [metaFormId, setMetaFormId] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [form, setForm] = useState<LeadFormState>(INITIAL_FORM);
  const [detailLead, setDetailLead] = useState<LeadRow | null>(null);
  const [visibleCols, setVisibleCols] = useState<string[]>(loadVisibleColumns);

  // Rótulo da coluna de origem por nicho. Fica no localStorage por enquanto;
  // quando virar configuração de empresa, é só trocar a fonte aqui.
  const originLabel =
    (typeof window !== 'undefined' && window.localStorage.getItem('altflow:leads:originLabel')) || 'Origem';

  const toggleColumn = (id: string) => {
    setVisibleCols((prev) => {
      const next = prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id];
      try {
        window.localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Preferência de coluna não vale quebrar a tela por causa de storage cheio.
      }
      return next;
    });
  };

  const companyId = company?.id;
  const currentUserId = user?.id ?? null;
  const leadsQuery = useQuery({
    queryKey: ['leads', companyId, search, status, temperature, assignment, metaFormId, currentUserId],
    queryFn: () => listLeads(companyId ?? '', { search, status, temperature, assignment, metaFormId, currentUserId }),
    enabled: Boolean(companyId),
  });

  const metaFormsQuery = useQuery({
    queryKey: ['meta-forms', companyId],
    queryFn: () => listMetaFormsForCompany(companyId ?? ''),
    enabled: Boolean(companyId),
  });

  // Nome e cor da etapa vêm do funil da empresa, iguais aos do pipeline.
  const stagesQuery = useQuery({
    queryKey: ['stages', companyId],
    queryFn: () => listStages(companyId ?? ''),
    enabled: Boolean(companyId),
  });
  const stages = stagesQuery.data ?? [];


  const createMutation = useMutation({
    mutationFn: () => {
      if (!companyId) throw new Error('Workspace não carregado.');
      return createLead({
        companyId,
        name: form.name,
        email: form.email,
        phone: form.phone,
        companyName: form.companyName,
        source: form.source,
      });
    },
    onSuccess: async (lead) => {
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      setForm(INITIAL_FORM);
      setIsDialogOpen(false);
      toast.success('Lead criado com histórico e score inicial.');
      navigate({ to: '/leads/$id', params: { id: lead.id } });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Não foi possível criar o lead.');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (leadId: string) => {
      if (!companyId) throw new Error('Workspace não carregado.');
      return archiveLead({ leadId, companyId });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead arquivado sem perder histórico.');
    },
    onError: () => toast.error('Não foi possível arquivar o lead.'),
  });

  const leads = leadsQuery.data ?? [];
  const metrics = useMemo(() => buildMetrics(leads), [leads]);

  const handleCreateLead = () => {
    if (!form.name.trim() && !form.email.trim() && !form.phone.trim()) {
      toast.error('Informe ao menos nome, e-mail ou telefone.');
      return;
    }
    createMutation.mutate();
  };

  const handleExportCSV = () => {
    if (leads.length === 0) {
      toast.error('Nenhum lead para exportar.');
      return;
    }

    const headers = ['Nome', 'Email', 'Telefone', 'Empresa', 'Origem', 'Status', 'Temperatura', 'Score', 'Atribuído', 'Criado em'];
    const rows = leads.map(l => [
      getLeadDisplayName(l),
      l.email || '',
      l.phone || '',
      getLeadCompanyName(l) || '',
      l.source || '',
      formatLabel(l.status || 'new'),
      formatLabel(getLeadTemperature(l)),
      getLeadScore(l),
      l.assigned_to || 'N/A',
      formatDate(l.created_at)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `leads-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Arquivo CSV gerado com sucesso.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Leads</h1>
          <p className="text-sm text-muted-foreground">Contatos capturados, com origem, cidade e quando chegaram.</p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            className="h-10 gap-2 font-bold"
            onClick={handleExportCSV}
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="h-10 gap-2 font-bold shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4" />
                Novo lead
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <UserPlus className="h-5 w-5 text-primary" />
                Criar lead manual
              </DialogTitle>
              <DialogDescription>
                Use para leads recebidos fora dos formulários, quizzes ou integrações automáticas.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4 sm:grid-cols-2">
              <LeadField label="Nome completo">
                <Input value={form.name} onChange={(event) => setFormField('name', event.target.value, setForm)} placeholder="Maria Silva" />
              </LeadField>
              <LeadField label="E-mail">
                <Input value={form.email} type="email" onChange={(event) => setFormField('email', event.target.value, setForm)} placeholder="maria@empresa.com" />
              </LeadField>
              <LeadField label="Telefone">
                <Input value={form.phone} onChange={(event) => setFormField('phone', event.target.value, setForm)} placeholder="(11) 99999-0000" />
              </LeadField>
              <LeadField label="Empresa">
                <Input value={form.companyName} onChange={(event) => setFormField('companyName', event.target.value, setForm)} placeholder="Empresa / Recanto" />
              </LeadField>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Origem</Label>
                <Select value={form.source} onValueChange={(value) => setFormField('source', value, setForm)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="referral">Indicação</SelectItem>
                    <SelectItem value="inbound">Inbound</SelectItem>
                    <SelectItem value="cold_outreach">Prospecção ativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={createMutation.isPending}>Cancelar</Button>
              <Button className="gap-2 font-bold" onClick={handleCreateLead} disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Criar lead
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Leads ativos" value={metrics.total} />
        <MetricCard label="Últimas 24h" value={metrics.today} />
        <MetricCard label="Novos 7 dias" value={metrics.newThisWeek} />
        <MetricCard label="Sem responsável" value={metrics.unassigned} />
      </div>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, e-mail ou telefone..." className="pl-10" />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:w-[820px] lg:grid-cols-4">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{formatLabel(option)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={temperature} onValueChange={(value) => setTemperature(value as typeof temperature)}>
            <SelectTrigger>
              <SelectValue placeholder="Temperatura" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {TEMPERATURE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{formatLabel(option)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assignment} onValueChange={(value) => setAssignment(value as typeof assignment)}>
            <SelectTrigger>
              <SelectValue placeholder="Atribuição" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os vendedores</SelectItem>
              <SelectItem value="mine">Meus leads</SelectItem>
              <SelectItem value="unassigned">Sem atribuição</SelectItem>
            </SelectContent>
          </Select>
          <Select value={metaFormId} onValueChange={setMetaFormId}>
            <SelectTrigger>
              <SelectValue placeholder="Formulário Meta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os formulários</SelectItem>
              {(metaFormsQuery.data ?? []).map((f) => (
                <SelectItem key={f.form_id} value={f.form_id}>{f.form_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Dê um duplo clique numa linha para ver a ficha completa.
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8">
              <Columns3 className="mr-2 h-3.5 w-3.5" />
              Colunas
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {COLUMNS.filter((c) => !c.locked).map((c) => (
              <DropdownMenuCheckboxItem
                key={c.id}
                checked={visibleCols.includes(c.id)}
                onCheckedChange={() => toggleColumn(c.id)}
                onSelect={(e) => e.preventDefault()}
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              {COLUMNS.filter((c) => visibleCols.includes(c.id)).map((c) => (
                <TableHead key={c.id} className={c.id === 'contato' ? 'min-w-[240px]' : undefined}>
                  {c.id === 'origem' ? originLabel : c.label}
                </TableHead>
              ))}
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leadsQuery.isLoading ? (
              <LoadingRows />
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleCols.length + 1} className="h-32 text-center text-sm text-muted-foreground">
                  Nenhum lead encontrado para os filtros atuais.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <LeadTableRow
                  key={lead.id}
                  lead={lead}
                  currentUserId={currentUserId}
                  visibleCols={visibleCols}
                  stages={stages}
                  onArchive={() => archiveMutation.mutate(lead.id)}
                  onOpen={() => setDetailLead(lead)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <LeadDetailDialog
        lead={detailLead}
        open={detailLead !== null}
        onOpenChange={(o) => !o && setDetailLead(null)}
        originLabel={originLabel}
        /* Mantém o lead em memória alinhado com o que foi salvo: sem isso,
           fechar e reabrir mostraria a etapa antiga até o refetch chegar. */
        onStatusChange={(leadId, status) =>
          setDetailLead((prev) => (prev && prev.id === leadId ? { ...prev, status } : prev))
        }
      />
    </div>
  );
}

function LeadTableRow({
  lead, currentUserId, visibleCols, stages, onArchive, onOpen,
}: {
  lead: LeadRow;
  currentUserId: string | null;
  visibleCols: string[];
  stages: Stage[];
  onArchive: () => void;
  onOpen: () => void;
}) {
  const stage = stages.find(
    (s) => s.id === (lead as { stage_id?: string | null }).stage_id,
  ) ?? null;
  const source = lead.source || lead.utm_source || 'direct';
  const origin = getLeadOrigin(lead);
  const city = getLeadCity(lead);
  const ago = relativeTime(lead.created_at);
  const assignedLabel = lead.assigned_to
    ? lead.assigned_to === currentUserId ? 'Você' : `${lead.assigned_to.slice(0, 8)}…`
    : '—';

  const show = (id: string) => visibleCols.includes(id);

  return (
    <TableRow
      className="group cursor-pointer transition-colors hover:bg-muted/60"
      onDoubleClick={onOpen}
    >
      {show('contato') && (
        <TableCell className="p-4">
          {/* Nem <Link> nem onClick aqui, de propósito. O link navegava no
              PRIMEIRO clique e o duplo clique nunca abria a ficha; com onClick,
              o primeiro clique abria o modal e o segundo caía no overlay e
              fechava. Abrir é responsabilidade do duplo clique na linha (e do
              menu, pra quem usa teclado). */}
          <div>
            <div className="font-bold text-foreground">
              {toTitleCase(getLeadDisplayName(lead)) || getLeadDisplayName(lead)}
            </div>
            <div className="text-xs font-medium text-muted-foreground">{lead.phone || lead.email || 'Sem contato informado'}</div>
          </div>
        </TableCell>
      )}
      {show('origem') && (
        <TableCell>
          {origin ? (
            <span className="text-sm font-medium">{origin}</span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </TableCell>
      )}
      {show('canal') && (
        <TableCell>
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            {source.toLowerCase().includes('meta') ? <Share2 className="h-4 w-4 text-primary" /> : <Globe className="h-4 w-4 text-muted-foreground" />}
            {formatLabel(source)}
          </div>
        </TableCell>
      )}
      {show('cidade') && (
        <TableCell>
          {city ? (
            <span
              className="flex items-center gap-1.5 text-sm"
              /* Cidade deduzida do DDD é um palpite: fica em tom mais fraco e
                 o title explica de onde veio, pra ninguém tratar como certeza. */
              title={city.inferred ? 'Deduzido do DDD do telefone' : undefined}
            >
              {city.inferred && <MapPin className="h-3 w-3 text-muted-foreground/60" />}
              <span className={city.inferred ? 'text-muted-foreground' : 'font-medium'}>{city.label}</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </TableCell>
      )}
      {show('status') && (
        <TableCell>
          {/* Nome e cor da etapa real do funil, não o `status` cru. A tabela
              mostrava "New" enquanto o pipeline dizia "Novo Lead" — dois nomes
              para a mesma coisa, vindos de duas fontes diferentes. */}
          {stage ? (
            <Badge
              variant="outline"
              style={{ borderColor: `${stage.color}55`, backgroundColor: `${stage.color}14`, color: stage.color }}
            >
              {stage.name}
            </Badge>
          ) : (
            <Badge variant="secondary">Sem etapa</Badge>
          )}
        </TableCell>
      )}
      {show('atribuido') && (
        <TableCell className="text-xs font-semibold">
          {lead.assigned_to ? (
            <Badge variant={lead.assigned_to === currentUserId ? 'default' : 'outline'}>{assignedLabel}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
      )}
      {show('criado') && (
        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
          <div className="font-medium text-foreground">{formatDateTime(lead.created_at)}</div>
          {ago && <div>{ago}</div>}
        </TableCell>
      )}
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onOpen} className="gap-2">
              <Eye className="h-4 w-4" />
              Ver ficha
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="gap-2">
              <Link to="/leads/$id" params={{ id: lead.id }}>
                <ExternalLink className="h-4 w-4" />
                Abrir página completa
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onArchive} className="gap-2">
              <Archive className="h-4 w-4" />
              Arquivar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function LeadField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-bold uppercase text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function MetricCard({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-bold uppercase text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-tight text-foreground">{value}{suffix}</div>
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      {[0, 1, 2, 3].map((row) => (
        <TableRow key={`loading-lead-${row}`}>
          <TableCell colSpan={8} className="p-4">
            <Skeleton className="h-10 w-full" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

/**
 * "Leads quentes" e "Score médio" saíram: vinham de valores fixos do
 * mapeamento, não de avaliação nenhuma, e mostravam 0 e 0/100 pra todo mundo.
 * No lugar entram contagens que respondem perguntas reais do dia a dia —
 * quantos chegaram hoje e quantos ninguém pegou ainda.
 */
function buildMetrics(leads: LeadRow[]) {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  const weekInMs = 7 * dayInMs;

  return {
    total: leads.length,
    today: leads.filter((lead) => now - new Date(lead.created_at).getTime() <= dayInMs).length,
    newThisWeek: leads.filter((lead) => now - new Date(lead.created_at).getTime() <= weekInMs).length,
    unassigned: leads.filter((lead) => !lead.assigned_to).length,
  };
}

function setFormField(field: keyof LeadFormState, value: string, setForm: Dispatch<SetStateAction<LeadFormState>>) {
  setForm((current) => ({ ...current, [field]: value }));
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
}
