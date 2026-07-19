import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, Download, Filter, Globe, Loader2, MoreHorizontal, Plus, Search, Share2, UserPlus } from 'lucide-react';

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
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
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
          <p className="text-sm text-muted-foreground">Pipeline de contatos com atribuição, score e origem de captura.</p>
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
        <MetricCard label="Novos 7 dias" value={metrics.newThisWeek} />
        <MetricCard label="Leads quentes" value={metrics.hot} />
        <MetricCard label="Score médio" value={metrics.averageScore} suffix="/100" />
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

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="min-w-[260px]">Contato</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Temperatura</TableHead>
              <TableHead className="w-[170px]">Score</TableHead>
              <TableHead>Atribuído</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leadsQuery.isLoading ? (
              <LoadingRows />
            ) : leads.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-sm text-muted-foreground">
                  Nenhum lead encontrado para os filtros atuais.
                </TableCell>
              </TableRow>
            ) : (
              leads.map((lead) => (
                <LeadTableRow key={lead.id} lead={lead} currentUserId={currentUserId} onArchive={() => archiveMutation.mutate(lead.id)} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function LeadTableRow({ lead, currentUserId, onArchive }: { lead: LeadRow; currentUserId: string | null; onArchive: () => void }) {
  const score = getLeadScore(lead);
  const source = lead.source || lead.utm_source || 'direct';
  const temperature = getLeadTemperature(lead);
  const assignedLabel = lead.assigned_to
    ? lead.assigned_to === currentUserId ? 'Você' : `${lead.assigned_to.slice(0, 8)}…`
    : '—';

  return (
    <TableRow className="group transition-colors hover:bg-muted/60">
      <TableCell className="p-0">
        <Link to="/leads/$id" params={{ id: lead.id }} className="block p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <div className="font-bold text-foreground">{getLeadDisplayName(lead)}</div>
          <div className="text-xs font-medium text-muted-foreground">{lead.email || lead.phone || 'Sem contato informado'}</div>
        </Link>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          {source.toLowerCase().includes('meta') ? <Share2 className="h-4 w-4 text-primary" /> : <Globe className="h-4 w-4 text-muted-foreground" />}
          {formatLabel(source)}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="capitalize">{formatLabel(lead.status || 'new')}</Badge>
      </TableCell>
      <TableCell>
        <Badge variant={temperature === 'hot' ? 'default' : 'outline'} className="capitalize">{formatLabel(temperature)}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <Progress value={score} className="h-1.5" />
          <span className="w-8 text-right text-xs font-bold tabular-nums">{score}</span>
        </div>
      </TableCell>
      <TableCell className="text-xs font-semibold">
        {lead.assigned_to ? (
          <Badge variant={lead.assigned_to === currentUserId ? 'default' : 'outline'}>{assignedLabel}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs font-medium text-muted-foreground">{formatDate(lead.created_at)}</TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
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

function buildMetrics(leads: LeadRow[]) {
  const now = Date.now();
  const weekInMs = 7 * 24 * 60 * 60 * 1000;
  const totalScore = leads.reduce((sum, lead) => sum + getLeadScore(lead), 0);

  return {
    total: leads.length,
    hot: leads.filter((lead) => getLeadTemperature(lead) === 'hot').length,
    newThisWeek: leads.filter((lead) => now - new Date(lead.created_at).getTime() <= weekInMs).length,
    averageScore: leads.length ? Math.round(totalScore / leads.length) : 0,
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
