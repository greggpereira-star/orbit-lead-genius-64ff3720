import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Trash2, UserPlus, Zap, Users, Thermometer } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { leadRoutingEngine, type RoutingConfig, type RoutingMember, type RoutingStrategy } from '@/modules/intelligence/services/leadRoutingEngine';
import { supabase } from '@/integrations/supabase/client';

export const Route = createFileRoute('/_app/settings/routing')({
  head: () => ({ meta: [{ title: 'Distribuição de Leads — Configurações' }] }),
  component: RoutingSettingsPage,
});

interface CompanyMember {
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
}

function RoutingSettingsPage() {
  const { company } = useAuth();
  const companyId = company?.id;
  const qc = useQueryClient();

  const configQ = useQuery({
    queryKey: ['routing-config', companyId],
    queryFn: () => leadRoutingEngine.getConfig(companyId as string),
    enabled: !!companyId,
  });

  const membersQ = useQuery({
    queryKey: ['routing-members', configQ.data?.id],
    queryFn: () => leadRoutingEngine.listMembers(configQ.data!.id),
    enabled: !!configQ.data?.id,
  });

  const companyMembersQ = useQuery({
    queryKey: ['company-members', companyId],
    queryFn: async (): Promise<CompanyMember[]> => {
      const { data } = await supabase
        .from('memberships')
        .select('user_id, role, profiles:user_id(full_name)')
        .eq('company_id', companyId as string);
      return ((data as unknown) as Array<{ user_id: string; role: string; profiles: { full_name: string | null } | null }> ?? []).map((m) => ({
        user_id: m.user_id,
        role: m.role,
        full_name: m.profiles?.full_name ?? null,
        email: null,
      }));
    },
    enabled: !!companyId,
  });

  const config = configQ.data;
  const members = membersQ.data ?? [];
  const companyMembers = companyMembersQ.data ?? [];

  async function ensureConfig(): Promise<RoutingConfig> {
    if (config) return config;
    const created = await leadRoutingEngine.upsertConfig(companyId as string, {
      name: 'Distribuição padrão',
      strategy: 'hybrid',
      is_active: true,
      hot_threshold: 70,
      warm_threshold: 40,
    });
    await qc.invalidateQueries({ queryKey: ['routing-config', companyId] });
    return created;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2"><Zap className="h-5 w-5 text-primary" /> Distribuição de Leads</h2>
        <p className="text-sm text-muted-foreground">Automatize a atribuição de leads para o time de vendas com base em temperatura e performance.</p>
      </div>

      <Tabs defaultValue="strategy">
        <TabsList>
          <TabsTrigger value="strategy"><Zap className="h-4 w-4 mr-1.5" />Estratégia</TabsTrigger>
          <TabsTrigger value="team"><Users className="h-4 w-4 mr-1.5" />Time</TabsTrigger>
          <TabsTrigger value="temperature"><Thermometer className="h-4 w-4 mr-1.5" />Temperatura</TabsTrigger>
        </TabsList>

        <TabsContent value="strategy" className="mt-4">
          <StrategyCard config={config} companyId={companyId as string} onSaved={() => qc.invalidateQueries({ queryKey: ['routing-config', companyId] })} companyMembers={companyMembers} />
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <TeamCard
            config={config}
            members={members}
            companyMembers={companyMembers}
            companyId={companyId as string}
            ensureConfig={ensureConfig}
            onChanged={() => qc.invalidateQueries({ queryKey: ['routing-members'] })}
          />
        </TabsContent>

        <TabsContent value="temperature" className="mt-4">
          <TemperatureCard config={config} companyId={companyId as string} onSaved={() => qc.invalidateQueries({ queryKey: ['routing-config', companyId] })} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StrategyCard({
  config, companyId, onSaved, companyMembers,
}: { config: RoutingConfig | null | undefined; companyId: string; onSaved: () => void; companyMembers: CompanyMember[] }) {
  const [strategy, setStrategy] = useState<RoutingStrategy>(config?.strategy ?? 'hybrid');
  const [fallback, setFallback] = useState<string>(config?.fallback_user_id ?? 'none');
  const [active, setActive] = useState<boolean>(config?.is_active ?? true);

  useEffect(() => {
    if (config) {
      setStrategy(config.strategy);
      setFallback(config.fallback_user_id ?? 'none');
      setActive(config.is_active);
    }
  }, [config]);

  async function save() {
    try {
      await leadRoutingEngine.upsertConfig(companyId, {
        strategy,
        is_active: active,
        fallback_user_id: fallback === 'none' ? null : fallback,
        name: config?.name ?? 'Distribuição padrão',
      });
      toast.success('Estratégia salva');
      onSaved();
    } catch (e: unknown) {
      toast.error('Erro ao salvar', { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estratégia de distribuição</CardTitle>
        <CardDescription>Escolha como novos leads são atribuídos ao time.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Distribuição automática ativa</p>
            <p className="text-xs text-muted-foreground">Quando desligada, leads chegam sem vendedor atribuído.</p>
          </div>
          <Switch checked={active} onCheckedChange={setActive} />
        </div>

        <div className="space-y-2">
          <Label>Estratégia</Label>
          <Select value={strategy} onValueChange={(v) => setStrategy(v as RoutingStrategy)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="round_robin">Round Robin (rodízio simples)</SelectItem>
              <SelectItem value="performance">Performance (melhor vendedor primeiro)</SelectItem>
              <SelectItem value="hybrid">Híbrido (leads quentes → top; demais → rodízio)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {strategy === 'round_robin' && 'Cada novo lead vai para o vendedor com maior tempo sem atribuição.'}
            {strategy === 'performance' && 'Leads sempre vão primeiro para vendedores com score ≥ 80.'}
            {strategy === 'hybrid' && 'Recomendado: leads 🔥 hot vão para top performers, warm/cold entram no rodízio.'}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Vendedor de fallback</Label>
          <Select value={fallback} onValueChange={setFallback}>
            <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum</SelectItem>
              {companyMembers.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>{m.full_name ?? m.user_id.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Recebe leads quando ninguém do pool está disponível.</p>
        </div>

        <Button onClick={save}>Salvar estratégia</Button>
      </CardContent>
    </Card>
  );
}

function TeamCard({
  config, members, companyMembers, companyId, ensureConfig, onChanged,
}: {
  config: RoutingConfig | null | undefined;
  members: RoutingMember[];
  companyMembers: CompanyMember[];
  companyId: string;
  ensureConfig: () => Promise<RoutingConfig>;
  onChanged: () => void;
}) {
  const [selectedUser, setSelectedUser] = useState<string>('');

  const nameOf = (userId: string) => companyMembers.find((m) => m.user_id === userId)?.full_name ?? userId.slice(0, 8);
  const availableToAdd = companyMembers.filter((m) => !members.some((rm) => rm.user_id === m.user_id));

  async function add() {
    if (!selectedUser) return;
    try {
      const cfg = await ensureConfig();
      await leadRoutingEngine.addMember(companyId, cfg.id, selectedUser);
      toast.success('Vendedor adicionado');
      setSelectedUser('');
      onChanged();
    } catch (e: unknown) {
      toast.error('Erro ao adicionar', { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pool de vendedores</CardTitle>
        <CardDescription>Time que recebe novos leads. Ajuste performance e disponibilidade.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Adicionar vendedor…" /></SelectTrigger>
            <SelectContent>
              {availableToAdd.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">Todos já no pool</div>}
              {availableToAdd.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>{m.full_name ?? m.user_id.slice(0, 8)} · {m.role}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={add} disabled={!selectedUser}><UserPlus className="h-4 w-4 mr-1.5" />Adicionar</Button>
        </div>

        {members.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum vendedor no pool. Adicione membros para começar a distribuir leads.
          </div>
        ) : (
          <div className="divide-y divide-border rounded-md border">
            {members.map((m) => (
              <MemberRow key={m.id} member={m} name={nameOf(m.user_id)} onChanged={onChanged} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MemberRow({ member, name, onChanged }: { member: RoutingMember; name: string; onChanged: () => void }) {
  const [score, setScore] = useState(member.performance_score);
  const [available, setAvailable] = useState(member.is_available);

  async function persist(patch: Partial<RoutingMember>) {
    try {
      await leadRoutingEngine.updateMember(member.id, patch);
      onChanged();
    } catch (e: unknown) {
      toast.error('Falha ao atualizar', { description: e instanceof Error ? e.message : undefined });
    }
  }

  async function remove() {
    try {
      await leadRoutingEngine.removeMember(member.id);
      toast.success('Removido do pool');
      onChanged();
    } catch (e: unknown) {
      toast.error('Erro ao remover', { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <div className="p-3 flex flex-col md:flex-row md:items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground">
          Último lead: {member.last_assigned_at ? new Date(member.last_assigned_at).toLocaleString('pt-BR') : 'nunca'}
        </p>
      </div>
      <div className="flex items-center gap-3 md:w-64">
        <span className="text-xs text-muted-foreground w-20 shrink-0">Performance</span>
        <Slider
          value={[score]}
          min={0}
          max={100}
          step={5}
          onValueChange={(v) => setScore(v[0])}
          onValueCommit={(v) => persist({ performance_score: v[0] })}
          className="flex-1"
        />
        <Badge variant={score >= 80 ? 'default' : 'outline'} className="w-10 justify-center">{score}</Badge>
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs">Ativo</Label>
        <Switch checked={available} onCheckedChange={(v) => { setAvailable(v); persist({ is_available: v }); }} />
        <Button variant="ghost" size="icon" onClick={remove}><Trash2 className="h-4 w-4 text-red-500" /></Button>
      </div>
    </div>
  );
}

function TemperatureCard({ config, companyId, onSaved }: { config: RoutingConfig | null | undefined; companyId: string; onSaved: () => void }) {
  const [hot, setHot] = useState(config?.hot_threshold ?? 70);
  const [warm, setWarm] = useState(config?.warm_threshold ?? 40);

  useEffect(() => {
    if (config) {
      setHot(config.hot_threshold);
      setWarm(config.warm_threshold);
    }
  }, [config]);

  async function save() {
    if (warm >= hot) {
      toast.error('Warm precisa ser menor que Hot');
      return;
    }
    try {
      await leadRoutingEngine.upsertConfig(companyId, { hot_threshold: hot, warm_threshold: warm });
      toast.success('Faixas atualizadas');
      onSaved();
    } catch (e: unknown) {
      toast.error('Erro ao salvar', { description: e instanceof Error ? e.message : undefined });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Faixas de temperatura</CardTitle>
        <CardDescription>Como o score do lead é convertido em temperatura.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-3 text-center text-xs">
          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3">
            <p className="text-blue-500 font-semibold">Cold</p>
            <p className="text-muted-foreground">score &lt; {warm}</p>
          </div>
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-amber-500 font-semibold">Warm</p>
            <p className="text-muted-foreground">{warm} – {hot - 1}</p>
          </div>
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3">
            <p className="text-red-500 font-semibold">🔥 Hot</p>
            <p className="text-muted-foreground">≥ {hot}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Corte para Warm ({warm})</Label>
          <Slider value={[warm]} min={0} max={100} step={5} onValueChange={(v) => setWarm(v[0])} />
        </div>
        <div className="space-y-2">
          <Label>Corte para Hot 🔥 ({hot})</Label>
          <Slider value={[hot]} min={0} max={100} step={5} onValueChange={(v) => setHot(v[0])} />
        </div>

        <div className="flex gap-2 items-end">
          <Input type="number" value={warm} min={0} max={100} onChange={(e) => setWarm(Number(e.target.value))} className="w-24" />
          <Input type="number" value={hot} min={0} max={100} onChange={(e) => setHot(Number(e.target.value))} className="w-24" />
          <Button onClick={save}>Salvar faixas</Button>
        </div>
      </CardContent>
    </Card>
  );
}
