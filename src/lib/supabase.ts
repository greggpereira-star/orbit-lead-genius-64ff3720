import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateEnv } from './env';

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (supabaseInstance) return supabaseInstance;

  const env = validateEnv();
  
  supabaseInstance = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'lovable-crm-auth-token',
    },
    global: {
      headers: { 'x-application-name': 'crm-enterprise-resilient' },
    },
    db: {
      schema: 'public',
    },
  });

  return supabaseInstance;
};

// Keep exported for compatibility, but recommend getSupabase()
export const supabase = typeof window !== 'undefined' ? getSupabase() : (null as any);

export const safeDb = async <T>(promise: Promise<T>, context: string): Promise<T> => {
  try {
    return await promise;
  } catch (error: any) {
    // Logging would happen here, but we must avoid dynamic imports if they cause issues
    // or handle them carefully. For now, simple console for stability.
    console.error(`Supabase Error in [${context}]:`, error);
    throw error;
  }
};