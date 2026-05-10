import { supabase } from '@/lib/supabase';

export type LogLevel = 'info' | 'warn' | 'error' | 'fatal';

interface LogContext {
  userId?: string;
  companyId?: string;
  route?: string;
  correlationId?: string;
  [key: string]: any;
}

class EnterpriseLogger {
  private _correlationId: string | null = null;

  private get correlationId(): string {
    if (!this._correlationId) {
      this._correlationId = typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : Math.random().toString(36).substring(2, 15);
    }
    return this._correlationId;
  }

  private async log(level: LogLevel, message: string, context: LogContext = {}) {
    const payload = {
      level,
      message,
      correlation_id: context.correlationId || this.correlationId,
      timestamp: new Date().toISOString(),
      route: context.route || (typeof window !== 'undefined' ? window.location.pathname : 'server'),
      user_id: context.userId,
      company_id: context.companyId,
      metadata: context,
    };

    // Console output for dev/observability
    const color = level === 'error' || level === 'fatal' ? '\x1b[31m' : '\x1b[32m';
    console.log(`[${payload.timestamp}] ${color}${level.toUpperCase()}\x1b[0m [${payload.correlation_id}] ${message}`, context);

    // Optimized background logging to avoid blocking the main thread.
    // Errors are sent to the backend via fire-and-forget; never block or throw.
    if (typeof window !== 'undefined' && (level === 'error' || level === 'fatal')) {
      setTimeout(() => {
        try {
          const client: any = supabase;
          if (client && typeof client.from === 'function') {
            Promise.resolve(
              client.from('system_logs').insert({
                level,
                message,
                correlation_id: payload.correlation_id,
                route: payload.route,
                user_id: payload.user_id,
                company_id: payload.company_id,
                metadata: payload.metadata,
              })
            ).catch(() => {});
          }
        } catch {
          // Never let logging break the app
        }
      }, 0);
    }
  }

  info(message: string, context?: LogContext) { this.log('info', message, context); }
  warn(message: string, context?: LogContext) { this.log('warn', message, context); }
  error(message: string, context?: LogContext) { this.log('error', message, context); }
  fatal(message: string, context?: LogContext) { this.log('fatal', message, context); }
  
  getCorrelationId() { return this.correlationId; }
}

export const logger = new EnterpriseLogger();
