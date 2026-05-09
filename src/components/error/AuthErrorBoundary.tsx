import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldAlert, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children?: ReactNode;
  name: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class AuthErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`CRITICAL Auth Failure in [${this.props.name}]:`, error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      const isConfigError = this.state.error?.message.includes('Supabase configuration missing');

      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-md w-full space-y-8 text-center animate-in fade-in zoom-in duration-500">
            <div className="mx-auto w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-destructive" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-3xl font-black tracking-tighter">
                {isConfigError ? 'Configuration Missing' : 'Security Layer Fault'}
              </h1>
              <p className="text-muted-foreground font-medium">
                {isConfigError 
                  ? 'The application environment is not properly configured. Please check your project secrets.' 
                  : 'An error occurred within the authentication subsystem.'}
              </p>
              
              <div className="mt-4 p-4 rounded-xl bg-destructive/[0.03] border border-destructive/10 text-left">
                 <p className="text-[10px] font-bold text-destructive uppercase tracking-widest mb-2 underline">Diagnostic Report</p>
                 <p className="text-xs font-mono text-foreground leading-relaxed break-all">
                   {this.state.error?.message}
                 </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Button size="lg" onClick={() => window.location.reload()} className="gap-2 font-bold h-12 shadow-lg shadow-primary/20">
                <RefreshCcw className="w-4 h-4" />
                Retry Initialization
              </Button>
              <Button variant="ghost" onClick={() => window.location.href = '/'} className="gap-2 text-muted-foreground h-12">
                <Home className="w-4 h-4" />
                Return to Landing
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
