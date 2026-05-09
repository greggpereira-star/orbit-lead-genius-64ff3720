import React from 'react';
import { RefreshCw, CheckCircle2, CircleDashed } from 'lucide-react';

interface TenantBootstrapProps {
  status: 'ACCOUNT_CREATED' | 'EMAIL_CONFIRMED' | 'BOOTSTRAPPING' | 'FINALIZING';
}

export const TenantBootstrap: React.FC<TenantBootstrapProps> = ({ status }) => {
  const steps = [
    { id: 'account', label: 'Account created', done: true },
    { id: 'email', label: 'Email verified', done: status !== 'ACCOUNT_CREATED' },
    { id: 'workspace', label: 'Creating workspace', active: status === 'BOOTSTRAPPING', done: status === 'FINALIZING' },
    { id: 'permissions', label: 'Configuring permissions', active: status === 'BOOTSTRAPPING', done: status === 'FINALIZING' },
    { id: 'dashboard', label: 'Initializing dashboard', active: status === 'FINALIZING' },
  ];

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-6 animate-in fade-in duration-1000">
      <div className="max-w-md w-full space-y-12 text-center">
        <div className="space-y-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center animate-pulse">
            <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black uppercase tracking-tighter">Preparing your workspace</h1>
            <p className="text-muted-foreground text-sm font-medium">Setting up your enterprise CRM environment...</p>
          </div>
        </div>

        <div className="bg-muted/30 border rounded-2xl p-6 space-y-6 text-left">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-center gap-4 group">
              <div className="relative">
                {idx < steps.length - 1 && (
                  <div className={`absolute top-6 left-3 w-[2px] h-6 ${step.done ? 'bg-primary' : 'bg-muted'} transition-colors duration-500`} />
                )}
                <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center ${step.done ? 'bg-primary text-primary-foreground' : step.active ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'} transition-all duration-500`}>
                  {step.done ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : step.active ? (
                    <CircleDashed className="h-4 w-4 animate-spin" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-current" />
                  )}
                </div>
              </div>
              <span className={`text-sm font-bold uppercase tracking-wider ${step.done ? 'text-foreground' : step.active ? 'text-primary' : 'text-muted-foreground'} transition-colors duration-500`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary/20 animate-bounce" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary/20 animate-bounce [animation-delay:0.2s]" />
          <div className="w-1.5 h-1.5 rounded-full bg-primary/20 animate-bounce [animation-delay:0.4s]" />
        </div>
      </div>
    </div>
  );
};
