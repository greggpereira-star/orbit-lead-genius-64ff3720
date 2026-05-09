import React, { Component, ErrorInfo, ReactNode } from 'react';
import { logger } from '@/core/observability/logger';
import { Button } from '@/components/ui/button';
import { RefreshCcw, Home, AlertCircle } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.fatal(`Crash in component [${this.props.name || 'Anonymous'}]: ${error.message}`, {
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      name: this.props.name
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-card rounded-xl border border-destructive/20 shadow-lg animate-in fade-in zoom-in duration-300">
          <div className="p-3 bg-destructive/10 rounded-full text-destructive mb-4">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Component failed to load</h2>
          <p className="text-muted-foreground max-w-md mb-6">
            An unexpected error occurred in this module. Our engineers have been notified.
          </p>
          <div className="flex gap-3">
            <Button onClick={this.handleReset} variant="outline" className="gap-2 font-bold border-destructive/20 hover:bg-destructive/5 text-destructive">
              <RefreshCcw className="h-4 w-4" />
              Reload Page
            </Button>
            <Button onClick={() => window.location.href = '/'} className="gap-2 font-bold bg-primary text-white">
              <Home className="h-4 w-4" />
              Back to Home
            </Button>
          </div>
          {process.env.NODE_ENV === 'development' && (
            <pre className="mt-8 p-4 bg-muted rounded-lg text-left text-[10px] overflow-auto max-w-full text-destructive-foreground font-mono border border-border">
              {this.state.error?.stack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
