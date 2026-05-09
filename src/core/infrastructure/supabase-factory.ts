import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getRuntimeConfig } from '../config/runtime-config';
import { logger } from '../observability/logger';

export class SafeSupabaseClientFactory {
  private static instance: SupabaseClient | null = null;
  private static initializationPromise: Promise<SupabaseClient> | null = null;

  static getInstanceSync(): SupabaseClient {
    if (this.instance) return this.instance;
    
    // Fallback to sync creation if needed, but warning
    const config = getRuntimeConfig();
    this.instance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'enterprise-auth-v1',
      },
      global: {
        headers: { 'x-client-info': 'resilient-enterprise-factory-sync' },
      },
    });
    return this.instance;
  }

  static async getInstance(): Promise<SupabaseClient> {
    if (this.instance) return this.instance;
    if (this.initializationPromise) return this.initializationPromise;

    this.initializationPromise = this.initialize();
    return this.initializationPromise;
  }

  private static async initialize(): Promise<SupabaseClient> {
    const config = getRuntimeConfig();
    const traceId = Math.random().toString(36).substring(2, 15);

    if (!config.isValid) {
      throw new Error('Supabase Factory: Invalid Config');
    }

    this.instance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'enterprise-auth-v1',
      },
      global: {
        headers: { 
          'x-client-info': 'resilient-enterprise-factory',
          'x-trace-id': traceId
        },
      },
    });

    return this.instance;
  }
}
