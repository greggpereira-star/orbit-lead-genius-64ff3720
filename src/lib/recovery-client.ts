import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Dedicated client for password recovery using the implicit flow.
 * The main app client uses PKCE, which requires the reset link to be opened
 * in the same browser that requested it — otherwise "Auth session missing!".
 * Implicit flow puts the tokens in the link itself, so it works anywhere.
 */
let client: SupabaseClient | null = null;

export function getRecoveryClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      import.meta.env.VITE_SUPABASE_URL as string,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
      {
        auth: {
          flowType: 'implicit',
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: 'leadflow-recovery',
        },
      },
    );
  }
  return client;
}
