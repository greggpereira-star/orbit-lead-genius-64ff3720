import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/core/observability/logger';
import { Button } from '@/components/ui/button';
import { RefreshCcw, Home, AlertCircle, ChevronDown, ChevronUp, Bug } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    showDetails: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, showDetails: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Auto-repair for Dynamic Import Failures (Stale Chunks)
    if (error.message?.includes('Failed to fetch dynamically imported module') || 
        error.message?.includes('chunk load failed')) {
      logger.warn('AuthRecovery: Stale chunk detected, initiating auto-reload', { error: error.message });
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      return;
    }

    const correlationId = logger.getCorrelationId();
    logger.fatal(`CRASH in [${this.props.name || 'Anonymous'}]: ${error.message}`, {
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      name: this.props.name,
      correlationId
    });
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const correlationId = logger.getCorrelationId();

      return (
        <div className="flex flex-col items-center justify-center min-h-[500px] p-8 text-center bg-card rounded-xl border border-destructive/20 shadow-2xl animate-in fade-in duration-500">
          <div className="p-4 bg-destructive/10 rounded-full text-destructive mb-6 shadow-inner">
            <Bug className="h-10 w-10" />
          </div>
          
          <h2 className="text-2xl font-black text-foreground mb-2 tracking-tight">Enterprise Application Fault</h2>
          <p className="text-muted-foreground max-w-lg mb-8 leading-relaxed font-medium">
            A critical rendering failure occurred in the <b>{this.props.name || 'Core'}</b> module. 
            The system integrity is preserved, but this component could not be hydration.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-md">
            <Button onClick={this.handleReset} variant="outline" className="gap-2 font-bold border-destructive/20 hover:bg-destructive/5 text-destructive h-12 shadow-sm">
              <RefreshCcw className="h-4 w-4" />
              Reset Lifecycle
            </Button>
            <Button onClick={() => window.location.href = '/'} className="gap-2 font-bold bg-primary text-white h-12 shadow-lg shadow-primary/20">
              <Home className="h-4 w-4" />
              Return Home
            </Button>
          </div>

          <div className="mt-8 w-full max-w-2xl text-left border rounded-lg bg-muted/30 overflow-hidden shadow-sm">
            <div 
              className="flex items-center justify-between p-3 bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors"
              onClick={() => this.setState({ showDetails: !this.state.showDetails })}
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Diagnostic Information</span>
              </div>
              {this.state.showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
            
            {this.state.showDetails && (
              <div className="p-4 space-y-4 animate-in slide-in-from-top-2 duration-300">
                <div>
                  <label className="text-[9px] font-bold text-muted-foreground uppercase">Correlation ID</label>
                  <div className="text-[11px] font-mono font-bold text-primary select-all">{correlationId}</div>
                </div>
                
                <div>
                  <label className="text-[9px] font-bold text-muted-foreground uppercase">Exception Signature</label>
                  <pre className="mt-1 p-3 bg-slate-950 rounded text-rose-400 text-[10px] overflow-auto max-h-40 font-mono border border-white/5">
                    {this.state.error?.message}
                    {"\n\n"}
                    {this.state.error?.stack}
                  </pre>
                </div>

                <div>
                  <label className="text-[9px] font-bold text-muted-foreground uppercase">Component Trace</label>
                  <pre className="mt-1 p-3 bg-slate-950 rounded text-slate-400 text-[10px] overflow-auto max-h-40 font-mono border border-white/5">
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </div>
              </div>
            )}
          </div>

          <p className="mt-8 text-[10px] text-muted-foreground font-medium italic">
            Telemetry has been dispatched automatically for forensic review.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
