 import { SupabaseClient } from '@supabase/supabase-js';
 import { SafeSupabaseClientFactory } from '@/core/infrastructure/supabase-factory';
 
 export const getSupabase = (): SupabaseClient => {
   return SafeSupabaseClientFactory.getInstanceSync();
 };
 
 // Keep exported for compatibility
 export const supabase = typeof window !== 'undefined' ? getSupabase() : ({} as any);

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