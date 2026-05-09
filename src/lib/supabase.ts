 import { createClient } from '@supabase/supabase-js';
 
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || '';
 
 if (!supabaseUrl || !supabaseAnonKey) {
   console.warn('Supabase credentials missing. Database features will be unavailable.');
 }
 
  // Advanced Enterprise Supabase Client with Resiliency and Logging
  export const supabase = supabaseUrl 
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        global: {
          headers: { 'x-application-name': 'crm-enterprise-resilient' },
        }
      }) 
    : (null as any);

  // Helper to handle safe database calls with auto-logging
  export const safeDb = async <T>(promise: Promise<T>, context: string): Promise<T> => {
    try {
      return await promise;
    } catch (error: any) {
      const { logger } = await import('@/core/observability/logger');
      logger.error(\`Supabase Error in [\${context}]: \${error.message}\`, {
        context,
        originalError: error,
        code: error.code
      });
      throw error;
    }
  };