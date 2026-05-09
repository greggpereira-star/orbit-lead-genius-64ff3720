import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { validateEnv } from './env';

let supabaseInstance: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient => {
  if (supabaseInstance) return supabaseInstance;

   let env;
   try {
     env = validateEnv();
   } catch (err) {
     console.error('❌ Supabase Client Init Failed: Env Validation Error', err);
     // Return a dummy client that throws on any method call to make it visible
     return new Proxy({} as SupabaseClient, {
       get: (target, prop) => {
         return () => {
           const msg = `CRITICAL: Supabase Client not initialized due to missing environment variables (${String(prop)})`;
           console.error(msg);
           if (typeof window !== 'undefined') {
             window.dispatchEvent(new CustomEvent('supabase_config_error', { detail: { message: msg } }));
           }
           throw new Error(msg);
         };
       }
     });
   }

   if (typeof window !== 'undefined') {
     console.log('✅ Supabase Client Init: Attempting creation with URL:', env.VITE_SUPABASE_URL);
   }

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