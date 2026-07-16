import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { chatTeamService, type ChatDepartment, type ChatOperator } from '@/modules/chat/services/chatTeamService';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Trash2, Users, Building2 } from 'lucide-react';

export const Route = createFileRoute('/_app/settings/chat')({
  component: ChatTeamSettings,
});

function ChatTeamSettings() {
  const { company } = useAuth();
  const companyId = company?.id;
  const qc = useQueryClient();

  const deptsQ = useQuery({
    queryKey: ['chat-team', 'departments', companyId],
    queryFn: () => chatTeamService.listDepartments(companyId!),
    enabled: !!companyId,
  });
  const opsQ = useQuery({
    queryKey: ['chat-team', 'operators', companyId],
    queryFn: () => chatTeamService.listOperators(companyId!),
    enabled: !!companyId,
  });

  const departments = deptsQ.data ?? [];
  const operators = opsQ.data ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['chat-team', 'departments', companyId] });
    qc.invalidateQueries({ queryKey: ['chat-team', 'operators', companyId] });
  };

  if (!companyId) return <div className="text-muted-foreground text-sm">Carregando…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Chat: setores e atendentes</h2>
        <p className="text-sm text-muted-foreground">
          Organize sua operação de chat ao vivo em setores e defina quem pode atender.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> Setores
          </CardTitle>
          <DepartmentDialog companyId={companyId} onSaved={refresh} />
        </CardHeader>
        <CardContent className="space-y-2">
          {departments.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum setor. Crie o primeiro para agrupar seus atendentes (ex: Vendas, Suporte).</p>
          )}
          {departments.map((d) => (
            <DepartmentRow key={d.id} dept={d} onChanged={refresh} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Atendentes
          </CardTitle>
          <OperatorDialog companyId={companyId} departments={departments} onSaved={refresh} />
        </CardHeader>
        <CardContent className="space-y-2">
          {operators.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum atendente cadastrado. Adicione o ID de usuário de cada operador para habilitá-lo no Chat ao vivo.
            </p>
          )}
          {operators.map((op) => (
            <OperatorRow key={op.id} operator={op} departments={departments} onChanged={refresh} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DepartmentDialog({ companyId, onSaved }: { companyId: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await chatTeamService.createDepartment({ companyId, name: name.trim(), description, color });
      toast.success('Setor criado');
      setOpen(false);
      setName(''); setDescription(''); setColor('#3b82f6');
      onSaved();
    } catch (e) {
      toast.error('Erro ao criar setor', { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo setor</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo setor</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vendas" />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Atende novos leads" />
          </div>
          <div className="space-y-1">
            <Label>Cor</Label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-20" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>Criar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DepartmentRow({ dept, onChanged }: { dept: ChatDepartment; onChanged: () => void }) {
  async function toggle() {
    await chatTeamService.updateDepartment(dept.id, { is_active: !dept.is_active });
    onChanged();
  }
  async function remove() {
    if (!confirm(`Excluir setor "${dept.name}"?`)) return;
    await chatTeamService.deleteDepartment(dept.id);
    toast.success('Setor removido');
    onChanged();
  }
  return (
    <div className="flex items-center justify-between border rounded-md px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="h-3 w-3 rounded-full" style={{ background: dept.color }} />
        <div>
          <div className="text-sm font-medium">{dept.name}</div>
          {dept.description && <div className="text-xs text-muted-foreground">{dept.description}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={dept.is_active ? 'default' : 'secondary'}>{dept.is_active ? 'Ativo' : 'Inativo'}</Badge>
        <Button variant="ghost" size="sm" onClick={toggle}>{dept.is_active ? 'Desativar' : 'Ativar'}</Button>
        <Button variant="ghost" size="icon" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function OperatorDialog({
  companyId,
  departments,
  onSaved,
}: {
  companyId: string;
  departments: ChatDepartment[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [departmentId, setDepartmentId] = useState<string>('none');
  const [role, setRole] = useState<'agent' | 'supervisor' | 'admin'>('agent');
  const [maxConcurrent, setMaxConcurrent] = useState(5);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!userId.trim()) return;
    setSaving(true);
    try {
      await chatTeamService.upsertOperator({
        companyId,
        userId: userId.trim(),
        displayName,
        departmentId: departmentId === 'none' ? null : departmentId,
        role,
        maxConcurrent,
      });
      toast.success('Atendente salvo');
      setOpen(false);
      setUserId(''); setDisplayName(''); setDepartmentId('none'); setRole('agent'); setMaxConcurrent(5);
      onSaved();
    } catch (e) {
      toast.error('Erro ao salvar atendente', { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo atendente</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo atendente</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>ID do usuário</Label>
            <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="uuid do usuário (auth.users.id)" />
            <p className="text-xs text-muted-foreground">Peça ao usuário o ID no perfil dele, ou copie do painel de membros.</p>
          </div>
          <div className="space-y-1">
            <Label>Nome exibido</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Ana Silva" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Setor</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem setor</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="agent">Atendente</SelectItem>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Máx. conversas simultâneas</Label>
            <Input type="number" min={1} max={50} value={maxConcurrent} onChange={(e) => setMaxConcurrent(Number(e.target.value) || 1)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={save} disabled={saving || !userId.trim()}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OperatorRow({
  operator,
  departments,
  onChanged,
}: {
  operator: ChatOperator;
  departments: ChatDepartment[];
  onChanged: () => void;
}) {
  async function setDept(v: string) {
    await chatTeamService.updateOperator(operator.id, { department_id: v === 'none' ? null : v });
    onChanged();
  }
  async function setRole(v: string) {
    await chatTeamService.updateOperator(operator.id, { role: v as ChatOperator['role'] });
    onChanged();
  }
  async function toggle() {
    await chatTeamService.updateOperator(operator.id, { is_active: !operator.is_active });
    onChanged();
  }
  async function remove() {
    if (!confirm('Remover atendente?')) return;
    await chatTeamService.deleteOperator(operator.id);
    toast.success('Atendente removido');
    onChanged();
  }

  const statusColor =
    operator.status === 'online' ? 'bg-emerald-500'
    : operator.status === 'away' ? 'bg-amber-500'
    : operator.status === 'busy' ? 'bg-red-500'
    : 'bg-muted-foreground/40';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border rounded-md px-3 py-2">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {operator.display_name || operator.user_id.slice(0, 8)}
          </div>
          <div className="text-xs text-muted-foreground truncate">{operator.user_id}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={operator.department_id ?? 'none'} onValueChange={setDept}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem setor</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={operator.role} onValueChange={setRole}>
          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="agent">Atendente</SelectItem>
            <SelectItem value="supervisor">Supervisor</SelectItem>
            <SelectItem value="admin">Administrador</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant={operator.is_active ? 'default' : 'secondary'}>{operator.is_active ? 'Ativo' : 'Inativo'}</Badge>
        <Button variant="ghost" size="sm" onClick={toggle}>{operator.is_active ? 'Desativar' : 'Ativar'}</Button>
        <Button variant="ghost" size="icon" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
