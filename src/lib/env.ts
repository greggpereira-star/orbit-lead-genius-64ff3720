import { z } from 'zod';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url('VITE_SUPABASE_URL must be a valid URL'),
  VITE_SUPABASE_ANON_KEY: z.string().min(1, 'VITE_SUPABASE_ANON_KEY is required'),
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (): Env => {
  try {
    const env = {
      VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || (typeof window !== 'undefined' ? (window as any)._env_?.VITE_SUPABASE_URL : process.env.VITE_SUPABASE_URL),
      VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY || (typeof window !== 'undefined' ? (window as any)._env_?.VITE_SUPABASE_ANON_KEY : process.env.VITE_SUPABASE_ANON_KEY),
    };
    
    return envSchema.parse(env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.issues.map(issue => issue.path.join('.')).join(', ');
      console.error('❌ Environment configuration error:', missingVars);
      throw new Error(`Supabase configuration missing: ${missingVars}`);
    }
    throw error;
  }
};
