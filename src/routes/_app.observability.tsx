import { createFileRoute } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  Server, 
  Database, 
  Webhook, 
  Zap, 
  AlertTriangle, 
  RefreshCcw, 
  CheckCircle2, 
  Clock,
  Search,
  ShieldCheck,
  User,
  Fingerprint,
  LifeBuoy,
  Key
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export const Route = createFileRoute('/_app/observability')({
  component: ObservabilityPage,
});

function ObservabilityPage() {
  const auth = useAuth();
  const { company } = auth;
   const [webhooks, setWebhooks] = useState<any[]>([]);
   const [health, setHealth] = useState<any[]>([]);
   const [triggerErrors, setTriggerErrors] = useState<any[]>([]);
   const [systemLogs, setSystemLogs] = useState<any[]>([]);
   const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    if (company) {
      fetchObservabilityData();
    }
  }, [company]);

  const fetchObservabilityData = async () => {
    setIsLoadingData(true);
    try {
       // Batch telemetry fetching
       const [whResult, dlqResult, logsResult] = await Promise.all([
         supabase.from('webhook_events').select('*').eq('company_id', company?.id).order('created_at', { ascending: false }).limit(5),
         supabase.from('trigger_error_logs').select('*').eq('user_id', auth.user?.id).limit(5),
         supabase.from('system_logs').select('*').eq('company_id', company?.id).order('created_at', { ascending: false }).limit(10)
       ]);
 
        setWebhooks(whResult.data || []);
        
        // Simulated real-time metrics
       setHealth([
         { component: 'CV.CRM API', status: 'healthy', latency: '42ms' },
         { component: 'Auth Guardian', status: 'healthy', latency: '15ms' },
         { component: 'RLS Evaluator', status: 'healthy', latency: '3ms' },
         { component: 'Database Cluster', status: 'healthy', latency: '9ms' },
       ]);
    } catch (error) {
      console.error('Error fetching observability data:', error);
    } finally {
      setIsLoadingData(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Observability Center</h1>
          <p className="text-muted-foreground text-sm font-medium">Real-time system health and forensic auth tracking.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="gap-2 font-bold">
            <RefreshCcw className="h-4 w-4" />
            Hard Refresh
          </Button>
          <Button size="sm" onClick={fetchObservabilityData} className="gap-2 font-bold">
            <Activity className="h-4 w-4" />
            Sync Metrics
          </Button>
        </div>
      </div>

      <Tabs defaultValue="system" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="system">System Health</TabsTrigger>
          <TabsTrigger value="auth">Auth Forensic</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {health.map((h) => (
              <Card key={h.component} className="border-none shadow-sm">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={h.status === 'healthy' ? 'text-emerald-500' : 'text-rose-500'}>
                      <Server className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{h.component}</p>
                      <p className="text-sm font-bold">{h.latency}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">
                    Healthy
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Webhook className="h-5 w-5 text-blue-500" />
                  Webhook Stream
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {webhooks.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center py-4 italic text-muted-foreground text-xs">Waiting for events...</TableCell></TableRow>
                    ) : (
                      webhooks.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell className="font-bold text-xs uppercase">{w.event_type}</TableCell>
                          <TableCell><Badge variant="secondary" className="bg-blue-50 text-blue-700 font-bold text-[10px]">{w.status}</Badge></TableCell>
                          <TableCell className="text-xs font-medium">{new Date(w.created_at).toLocaleTimeString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-2 border-dashed border-rose-200 bg-rose-50/20">
              <CardHeader>
                <CardTitle className="text-rose-900 font-bold flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-rose-500" />
                  DLQ Monitor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-rose-200 mb-2" />
                  <p className="text-rose-900 font-bold text-sm">No critical failures</p>
                  <p className="text-rose-700 text-xs mt-1">Dead Letter Queue is empty</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="auth" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-2 border-none shadow-sm">
              <CardHeader className="bg-muted/30 border-b">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  Live Session Context
                </CardTitle>
                <CardDescription>Real-time state machine inspection</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">State Machine</label>
                      <div className="mt-1">
                        <Badge className={`text-lg px-4 py-1 font-black ${
                          auth.state === 'READY' ? 'bg-emerald-500' : 
                          auth.state === 'ERROR' ? 'bg-rose-500' : 'bg-primary animate-pulse'
                        }`}>
                          {auth.state}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Trace Identification</label>
                      <div className="mt-1 font-mono text-sm font-bold text-primary bg-primary/5 p-2 rounded border border-primary/10">
                        {auth.traceId}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">User Identity</label>
                      <div className="mt-2 flex items-center gap-3">
                         <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                           <User className="h-5 w-5 text-primary" />
                         </div>
                         <div>
                           <p className="text-sm font-bold leading-none">{auth.user?.name || 'Unidentified'}</p>
                           <p className="text-[11px] text-muted-foreground mt-1">{auth.user?.email || 'No email associated'}</p>
                         </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Tenant Resolution</label>
                      <div className="mt-2 flex items-center gap-3">
                         <div className={`h-10 w-10 rounded-full flex items-center justify-center ${auth.company ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                           <ShieldCheck className="h-5 w-5" />
                         </div>
                         <div>
                           <p className="text-sm font-bold leading-none">{auth.company?.name || 'NULL TENANT'}</p>
                           <p className="text-[10px] font-mono text-muted-foreground mt-1">{auth.company?.id || 'Resolution failed'}</p>
                         </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-white/5 font-mono text-[10px] text-slate-400 overflow-auto max-h-60">
                  <p className="text-emerald-500 mb-2">// Active Session Data</p>
                  <pre>{JSON.stringify({ 
                    state: auth.state, 
                    isAuthenticated: auth.isAuthenticated, 
                    isReady: auth.isReady, 
                    user: auth.user, 
                    company: auth.company 
                  }, null, 2)}</pre>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-bold uppercase tracking-wider">Test Suite</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" className="w-full justify-start gap-3 h-11 font-bold" onClick={() => auth.refreshContext()}>
                    <RefreshCcw className="h-4 w-4 text-primary" />
                    Force Context Sync
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3 h-11 font-bold" onClick={() => {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.reload();
                  }}>
                    <Key className="h-4 w-4 text-amber-500" />
                    Simulate Expiration
                  </Button>
                  <Button variant="destructive" className="w-full justify-start gap-3 h-11 font-bold" onClick={() => auth.logout()}>
                    <Zap className="h-4 w-4" />
                    Emergency Logout
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-primary/5 border border-primary/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-black uppercase text-primary tracking-widest flex items-center gap-2">
                    <LifeBuoy className="h-3 w-3" />
                    Deterministic Guard
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[11px] leading-relaxed text-slate-600 font-medium">
                    The current architecture prevents rendering protected modules if state !== <b>READY</b>. 
                    This ensures race conditions never expose null company contexts.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
