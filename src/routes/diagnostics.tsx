import { createFileRoute } from '@tanstack/react-router';
import { BootstrapEngine, BootstrapState } from '@/core/bootstrap/bootstrap-engine';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, ShieldCheck, Database, Lock, Globe, Terminal, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/diagnostics')({
  component: DiagnosticsPage,
});

function DiagnosticsPage() {
  const [state, setState] = useState<BootstrapState>(BootstrapEngine.getState());

  useEffect(() => {
    const unsubscribe = BootstrapEngine.subscribe(setState);
    return unsubscribe;
  }, []);

  const getStatusIcon = (healthy: boolean) => {
    return healthy ? <ShieldCheck className="h-5 w-5 text-emerald-500" /> : <Activity className="h-5 w-5 text-destructive" />;
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8 space-y-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tighter uppercase">Runtime Diagnostics</h1>
            <p className="text-muted-foreground">Infrastructure Integrity & Configuration Status</p>
          </div>
          <Badge variant={state.status === 'ready' ? 'default' : 'destructive'} className="h-8 px-4 text-sm font-bold">
            {state.status.toUpperCase()}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider">Configuraton</CardTitle>
              <Terminal className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Valid Configuration:</span>
                  <Badge variant={state.config?.isValid ? "default" : "destructive"}>
                    {state.config?.isValid ? "VALID" : "INVALID"}
                  </Badge>
                </div>
                <div className="text-[10px] font-mono bg-slate-900 text-slate-100 p-3 rounded overflow-x-auto">
                  <pre>{JSON.stringify(state.config, null, 2)}</pre>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider">Health Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Overall Status:</span>
                  <Badge variant={state.health?.status === 'healthy' ? "default" : "destructive"}>
                    {state.health?.status?.toUpperCase() || 'UNKNOWN'}
                  </Badge>
                </div>
                
                <div className="grid gap-2">
                  <div className="flex items-center justify-between p-2 rounded bg-white border">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      <span className="text-sm">Auth Service</span>
                    </div>
                    {getStatusIcon(!!state.health?.checks.auth)}
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-white border">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      <span className="text-sm">Database REST</span>
                    </div>
                    {getStatusIcon(!!state.health?.checks.database)}
                  </div>
                  <div className="flex items-center justify-between p-2 rounded bg-white border">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span className="text-sm">Environment</span>
                    </div>
                    {getStatusIcon(!!state.health?.checks.env)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-2">
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider">Latency Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(state.health?.latency || {}).map(([key, value]) => (
                  <div key={key} className="p-4 rounded-xl border bg-white flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">{key}</span>
                    <span className="text-2xl font-black">{value}ms</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button 
            className="flex-1 h-12 font-bold uppercase" 
            onClick={() => BootstrapEngine.retry()}
            disabled={state.status === 'health-checking'}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${state.status === 'health-checking' ? 'animate-spin' : ''}`} />
            Recalibrate Runtime
          </Button>
          <Button variant="outline" className="h-12 px-8 font-bold" onClick={() => window.location.href = '/'}>
            Back Home
          </Button>
        </div>

        {state.error && (
          <div className="p-4 bg-destructive/10 border-2 border-destructive/20 rounded-xl">
            <h3 className="text-destructive font-black uppercase text-xs mb-2">Bootstrap Error Log</h3>
            <p className="font-mono text-xs text-destructive leading-relaxed">{state.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
