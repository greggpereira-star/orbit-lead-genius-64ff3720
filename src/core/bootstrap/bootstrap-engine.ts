import { getRuntimeConfig, RuntimeConfig } from '../config/runtime-config';
import { runInfrastructureCheck, HealthReport } from '../runtime/health-checker';
import { SafeSupabaseClientFactory } from '../infrastructure/supabase-factory';
import { logger } from '../observability/logger';

export type BootstrapStatus = 'idle' | 'configuring' | 'validating' | 'health-checking' | 'initializing-supabase' | 'ready' | 'failed';

export interface BootstrapState {
  status: BootstrapStatus;
  config: RuntimeConfig | null;
  health: HealthReport | null;
  error: string | null;
  timestamp: string;
}

export class BootstrapEngine {
  private static state: BootstrapState = {
    status: 'idle',
    config: null,
    health: null,
    error: null,
    timestamp: new Date().toISOString(),
  };

  private static listeners: ((state: BootstrapState) => void)[] = [];

  static getState(): BootstrapState {
    return { ...this.state };
  }

  static subscribe(listener: (state: BootstrapState) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private static setState(newState: Partial<BootstrapState>) {
    this.state = { ...this.state, ...newState, timestamp: new Date().toISOString() };
    this.listeners.forEach(l => l(this.state));
    logger.info(`Bootstrap Engine State Change: ${this.state.status}`, { status: this.state.status });
  }

  static async run() {
    if (this.state.status === 'ready' || this.state.status === 'health-checking') return;

    const traceId = Math.random().toString(36).substring(2, 15);
    logger.info('Bootstrap Engine: Starting Sequence', { traceId });

    try {
      // 1. Runtime Config Load
      this.setState({ status: 'configuring' });
      const config = getRuntimeConfig();
      this.setState({ config });

      // 2. Config Validation
      if (!config.isValid) {
        throw new Error(`Invalid Configuration: ${config.errors?.join(', ')}`);
      }

      // 3. Infra Healthcheck
      this.setState({ status: 'health-checking' });
      const health = await runInfrastructureCheck();
      this.setState({ health });

      if (health.status === 'unhealthy') {
        throw new Error(`Infrastructure Health Check Failed: ${health.details.error || 'Unknown error'}`);
      }

      // 4. Supabase Validation & Initialization
      this.setState({ status: 'initializing-supabase' });
      await SafeSupabaseClientFactory.getInstance();

      // 5. Success
      this.setState({ status: 'ready', error: null });
      logger.info('Bootstrap Engine: Sequence Completed Successfully', { traceId });
    } catch (err: any) {
      logger.error('Bootstrap Engine: Sequence Failed', { traceId, error: err.message });
      this.setState({ status: 'failed', error: err.message });
    }
  }

  static async retry() {
    this.setState({ status: 'idle', error: null });
    return this.run();
  }
}
