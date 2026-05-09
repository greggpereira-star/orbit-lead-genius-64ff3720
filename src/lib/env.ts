 import { getRuntimeConfig } from '@/core/config/runtime-config';
 
 export interface Env {
   VITE_SUPABASE_URL: string;
   VITE_SUPABASE_ANON_KEY: string;
 }
 
 export const validateEnv = (): Env => {
   const config = getRuntimeConfig();
   return {
     VITE_SUPABASE_URL: config.supabaseUrl,
     VITE_SUPABASE_ANON_KEY: config.supabaseAnonKey,
   };
 };
