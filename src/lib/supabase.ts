 import { createClient } from '@supabase/supabase-js';
 
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || '';
 
 if (!supabaseUrl || !supabaseAnonKey) {
   console.warn('Supabase credentials missing. Database features will be unavailable.');
 }
 
 // Advanced Enterprise Supabase Client with Resiliency and Logging
 export const supabase = supabaseUrl && supabaseAnonKey
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