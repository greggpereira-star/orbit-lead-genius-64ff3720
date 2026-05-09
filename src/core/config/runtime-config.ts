import { z } from 'zod';

const configSchema = z.object({
  supabaseUrl: z.string().url('VITE_SUPABASE_URL must be a valid URL'),
  supabaseAnonKey: z.string().min(1, 'VITE_SUPABASE_ANON_KEY is required'),
  isDevelopment: z.boolean(),
  isProduction: z.boolean(),
  appName: z.string().default('Enterprise Resilient CRM'),
});

 export interface RuntimeConfig {
   supabaseUrl: string;
   supabaseAnonKey: string;
   isDevelopment: boolean;
   isProduction: boolean;
   isTest: boolean;
   appName: string;
   environment: 'development' | 'production' | 'test';
   isValid: boolean;
   errors?: string[];
   metadata: {
     timestamp: string;
     version: string;
   };
 }

let configInstance: RuntimeConfig | null = null;

 export const getRuntimeConfig = (): RuntimeConfig => {
   if (configInstance) return configInstance;
 
   const rawConfig = {
     supabaseUrl: import.meta.env.VITE_SUPABASE_URL || 
                 (typeof window !== 'undefined' ? (window as any)._env_?.VITE_SUPABASE_URL : null) || 
                 'https://placeholder-project.supabase.co',
      supabaseAnonKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
                       import.meta.env.VITE_SUPABASE_ANON_KEY || 
                       (typeof window !== 'undefined' ? ((window as any)._env_?.VITE_SUPABASE_PUBLISHABLE_KEY || (window as any)._env_?.VITE_SUPABASE_ANON_KEY) : null) || 
                       'placeholder-key',
     isDevelopment: !!import.meta.env.DEV,
     isProduction: !!import.meta.env.PROD,
      isTest: import.meta.env.MODE === 'test',
     appName: 'Enterprise Resilient CRM',
     environment: (import.meta.env.MODE as any) || 'development',
   };
 
   const result = configSchema.safeParse(rawConfig);
   
   configInstance = {
     ...rawConfig,
     isValid: result.success && rawConfig.supabaseUrl !== 'https://placeholder-project.supabase.co' && rawConfig.supabaseAnonKey !== 'placeholder-key',
     errors: result.success ? [] : result.error.errors.map(e => e.message),
     metadata: {
       timestamp: new Date().toISOString(),
       version: '1.0.0-resilient',
     }
   } as RuntimeConfig;
 
   if (configInstance.supabaseUrl === 'https://placeholder-project.supabase.co') {
     configInstance.isValid = false;
     configInstance.errors?.push('VITE_SUPABASE_URL is using placeholder value');
   }
 
   if (configInstance.supabaseAnonKey === 'placeholder-key') {
     configInstance.isValid = false;
     configInstance.errors?.push('VITE_SUPABASE_ANON_KEY is using placeholder value');
   }
 
   if (!result.success) {
     console.warn('⚠️ Runtime Configuration is incomplete:', configInstance.errors);
   }
 
   return configInstance;
 };
