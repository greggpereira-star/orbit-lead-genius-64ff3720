 import { createClient } from '@supabase/supabase-js';
 
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || '';
 
 if (!supabaseUrl || !supabaseAnonKey) {
   console.warn('Supabase credentials missing. Database features will be unavailable.');
 }
 
 // Advanced Enterprise Supabase Client with Resiliency and Logging
 export const supabase = (() => {
   if (!supabaseUrl || !supabaseAnonKey) {
     // Return a proxy that logs warnings instead of crashing when credentials are missing
     return new Proxy({} as any, {
       get: (target, prop) => {
         if (prop === 'auth') {
           return {
             getSession: async () => ({ data: { session: null }, error: null }),
             onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
             signInWithPassword: async () => { throw new Error('Supabase credentials missing'); },
             signUp: async () => { throw new Error('Supabase credentials missing'); },
             signOut: async () => {},
           };
         }
         return () => ({
           from: () => ({
             select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }), order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }),
             insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
             update: () => ({ eq: async () => ({ data: null, error: null }) }),
             delete: () => ({ eq: async () => ({ data: null, error: null }) }),
           }),
         });
       }
     });
   }
 
   return createClient(supabaseUrl, supabaseAnonKey, {
     auth: {
       persistSession: true,
       autoRefreshToken: true,
       detectSessionInUrl: true,
     },
     global: {
       headers: { 'x-application-name': 'crm-enterprise-resilient' },
     }
   });
 })();

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