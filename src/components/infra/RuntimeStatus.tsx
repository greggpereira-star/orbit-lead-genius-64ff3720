import { useState, useEffect } from 'react';
import { BootstrapEngine, BootstrapState } from '@/core/bootstrap/bootstrap-engine';
import { Activity, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Link } from '@tanstack/react-router';

export const RuntimeStatus = () => {
  const [state, setState] = useState<BootstrapState>(BootstrapEngine.getState());
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    const unsubscribe = BootstrapEngine.subscribe(setState);
    setIsDev(import.meta.env.DEV);
    return unsubscribe;
  }, []);

  if (!isDev) return null;

  const getStatusColor = () => {
    if (state.status === 'ready') return 'text-emerald-500';
    if (state.status === 'failed') return 'text-destructive';
    if (state.health?.status === 'degraded') return 'text-amber-500';
    return 'text-blue-500';
  };

  const Icon = state.status === 'ready' ? ShieldCheck : state.status === 'failed' ? AlertTriangle : Activity;

  return (
    <Link 
      to="/diagnostics"
      className="fixed bottom-4 right-4 z-[9999] p-2 bg-background border shadow-2xl rounded-full flex items-center gap-2 hover:scale-105 transition-transform"
    >
      <Icon className={`h-4 w-4 ${getStatusColor()} ${state.status !== 'ready' && state.status !== 'failed' ? 'animate-pulse' : ''}`} />
      <span className="text-[10px] font-black uppercase tracking-widest pr-2">{state.status}</span>
    </Link>
  );
};
