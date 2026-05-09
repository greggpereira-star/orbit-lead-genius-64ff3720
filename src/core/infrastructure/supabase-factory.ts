import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getRuntimeConfig } from '../config/runtime-config';
import { logger } from '../observability/logger';

export class SafeSupabaseClientFactory {
  private static instance: SupabaseClient | null = null;

  static getInstance(): SupabaseClient {
    if (this.instance) return this.instance;
    
    const config = getRuntimeConfig();
    
    // Ensure only one client exists with strict persistence settings
    this.instance = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'enterprise-auth-v1',
        flowType: 'pkce',
      },
      global: {
        headers: { 
          'x-client-info': 'leadflow-enterprise-singleton',
        },
      },
    });

    logger.info('Supabase Factory: Singleton instance established');
    return this.instance;
  }

  // Kept for backward compatibility with existing code
  static getInstanceSync(): SupabaseClient {
    return this.getInstance();
  }
}
