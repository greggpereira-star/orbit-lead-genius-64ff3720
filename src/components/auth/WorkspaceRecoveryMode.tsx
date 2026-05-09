import React, { useState } from 'react';
import { ShieldAlert, RefreshCw, LogOut, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/core/auth/context/AuthContext';

export const WorkspaceRecoveryMode: React.FC = () => {
  const { refreshContext, logout, traceId } = useAuth();
  const [isRecovering, setIsRecovering] = useState(false);

  const handleRecovery = async () => {
    setIsRecovering(true);
    try {
      await refreshContext();
    } finally {
      setIsRecovering(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-6 animate-in fade-in duration-700">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black uppercase tracking-tighter">Workspace Sync Required</h1>
            <p className="text-muted-foreground text-sm font-medium">
              We detected a workspace mismatch or session expiration. 
              Re-validating your enterprise permissions...
            </p>
          </div>
        </div>

        <div className="bg-muted/30 border rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
              <RefreshCw className={`h-4 w-4 text-primary ${isRecovering ? 'animate-spin' : ''}`} />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold uppercase tracking-wider">Silent Re-validation</p>
              <p className="text-xs text-muted-foreground">Attempts to repair your workspace context without restarting onboarding.</p>
            </div>
          </div>
          
          <div className="pt-2">
            <Button 
              onClick={handleRecovery} 
              disabled={isRecovering}
              className="w-full group font-bold uppercase tracking-widest text-xs h-12"
            >
              {isRecovering ? 'Recovering...' : 'Repair Connection'}
              <ChevronRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Button variant="ghost" onClick={logout} className="text-muted-foreground text-xs font-bold uppercase tracking-widest">
            <LogOut className="mr-2 h-3 w-3" />
            Sign out and restart
          </Button>
          <p className="text-[10px] text-center text-muted-foreground font-mono opacity-50">
            TRACE_ID: {traceId}
          </p>
        </div>
      </div>
    </div>
  );
};