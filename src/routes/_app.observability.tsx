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
  ExternalLink,
  Search
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const Route = createFileRoute('/_app/observability')({
  component: ObservabilityPage,
});

function ObservabilityPage() {
  const { company } = useAuth();
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [automations, setAutomations] = useState<any[]>([]);
  const [health, setHealth] = useState<any[]>([]);
  const [dlq, setDlq] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (company) {
      fetchObservabilityData();
    }
  }, [company]);

  const fetchObservabilityData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Webhook Events
      const { data: whData } = await supabase
        .from('webhook_events')
        .select('*')
        .eq('company_id', company?.id)
        .order('created_at', { ascending: false })
        .limit(5);
      
      setWebhooks(whData || []);

      // 2. Fetch Automation Executions
      const { data: autoData } = await supabase
        .from('automation_executions')
        .select('*, rule:automation_rules(name)')
        .eq('company_id', company?.id)
        .order('created_at', { ascending: false })
        .limit(5);

      setAutomations(autoData || []);

      // 3. System Health (Mocado para exemplo de UI)
      setHealth([
        { component: 'CV.CRM API', status: 'healthy', latency: '45ms' },
        { component: 'Event Bus', status: 'healthy', latency: '2ms' },
        { component: 'Rule Engine', status: 'healthy', latency: '12ms' },
        { component: 'Database', status: 'healthy', latency: '8ms' },
      ]);

      // 4. DLQ
      const { data: dlqData } = await supabase
        .from('dead_letter_queue')
        .select('*')
        .eq('company_id', company?.id)
        .limit(5);
      
      setDlq(dlqData || []);

    } catch (error) {
      console.error('Error fetching observability data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Observability Center</h1>
          <p className="text-muted-foreground text-sm font-medium">Real-time system health, event bus monitoring and audit logs.</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchObservabilityData} className="gap-2 font-bold">
          <RefreshCcw className="h-4 w-4" />
          Refresh Metrics
        </Button>
      </div>

      {/* Health Grid */}
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
        {/* Webhooks Monitor */}
        <Card className="border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5 text-blue-500" />
                Webhook Ingestion
              </CardTitle>
              <CardDescription>Real-time CV.CRM event stream</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-primary font-bold">View All</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-4">No events found</TableCell></TableRow>
                ) : (
                  webhooks.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-bold text-xs uppercase">{w.event_type}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-blue-50 text-blue-700 font-bold text-[10px]">{w.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{new Date(w.created_at).toLocaleTimeString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8"><Search className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Automation Monitor */}
        <Card className="border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Automation Engine
              </CardTitle>
              <CardDescription>Worker execution status and performance</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-primary font-bold">View Logs</Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead className="text-right">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {automations.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-4">No executions found</TableCell></TableRow>
                ) : (
                  automations.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-bold text-xs">{a.rule?.name || 'Rule'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 font-bold text-[10px]">{a.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{a.duration_ms}ms</TableCell>
                      <TableCell className="text-right">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Dead Letter Queue Section */}
      <Card className="border-2 border-dashed border-rose-200 bg-rose-50/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-rose-900 font-bold">Dead Letter Queue (DLQ)</CardTitle>
                <CardDescription className="text-rose-700 font-medium">Failed events awaiting manual intervention or re-ingestion.</CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-100 font-bold">Pause Ingestion</Button>
              <Button className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-2">
                <RefreshCcw className="h-4 w-4" />
                Retry All Failed
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-white rounded-xl border border-rose-100 overflow-hidden">
             <Table>
               <TableHeader className="bg-rose-50/50">
                 <TableRow className="border-rose-100">
                   <TableHead className="text-rose-900 font-bold">Origin</TableHead>
                   <TableHead className="text-rose-900 font-bold">Payload Hash</TableHead>
                   <TableHead className="text-rose-900 font-bold">Error Message</TableHead>
                   <TableHead className="text-rose-900 font-bold">Retries</TableHead>
                   <TableHead className="text-right text-rose-900 font-bold">Actions</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {dlq.length === 0 ? (
                   <TableRow><TableCell colSpan={5} className="text-center py-8 text-rose-400 font-medium italic">DLQ is empty. All systems operational.</TableCell></TableRow>
                 ) : (
                   dlq.map((d) => (
                     <TableRow key={d.id} className="border-rose-50">
                       <TableCell className="font-bold text-xs uppercase text-rose-900">{d.origin_table}</TableCell>
                       <TableCell className="font-mono text-[10px] text-rose-700">0x{d.id.split('-')[0]}</TableCell>
                       <TableCell className="text-xs text-rose-600 font-medium">{d.last_error}</TableCell>
                       <TableCell className="font-bold text-rose-900">{d.retry_count || 0}</TableCell>
                       <TableCell className="text-right space-x-2">
                         <Button variant="ghost" size="sm" className="h-8 text-rose-700 font-bold">Inspect</Button>
                         <Button size="sm" className="h-8 bg-rose-600 text-white font-bold">Retry</Button>
                       </TableCell>
                     </TableRow>
                   ))
                 )}
               </TableBody>
             </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
