import { z } from 'zod';

const configSchema = z.object({
  supabaseUrl: z.string().url('VITE_SUPABASE_URL must be a valid URL'),
  supabaseAnonKey: z.string().min(1, 'VITE_SUPABASE_ANON_KEY is required'),
  isDevelopment: z.boolean(),
  isProduction: z.boolean(),
  appName: z.string().default('Enterprise Resilient CRM'),
});

export type RuntimeConfig = z.infer<typeof configSchema>;

let configInstance: RuntimeConfig | null = null;

export const getRuntimeConfig = (): RuntimeConfig => {
  if (configInstance) return configInstance;

  const rawConfig = {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || (typeof window !== 'undefined' ? (window as any)._env_?.VITE_SUPABASE_URL : process.env.VITE_SUPABASE_URL),
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof window !== 'undefined' ? (window as any)._env_?.VITE_SUPABASE_ANON_KEY : process.env.VITE_SUPABASE_ANON_KEY),
    isDevelopment: typeof import.meta.env.DEV !== 'undefined' ? import.meta.env.DEV : true,
    isProduction: typeof import.meta.env.PROD !== 'undefined' ? import.meta.env.PROD : false,
    appName: 'Enterprise Resilient CRM',
  };

  try {
    configInstance = configSchema.parse(rawConfig);
    return configInstance;
  } catch (error) {
    console.error('❌ Runtime Configuration Integrity Failure:', error);
    throw error;
  }
};
