// Scoped anon Supabase clients that attach a visitor/session token header.
// RLS policies match `visitor_id` / `session_id` against these headers so
// anon users can only read/write their own chat conversation or partial
// form submission — never other visitors' rows.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

function url() {
  return (import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL) as string;
}
function key() {
  return (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY) as string;
}

export function createVisitorSupabase(headers: Record<string, string>): SupabaseClient<Database> {
  return createClient<Database>(url(), key(), {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: { headers },
  });
}

export function createChatVisitorClient(visitorId: string) {
  return createVisitorSupabase({ 'x-visitor-id': visitorId });
}

export function createSessionVisitorClient(sessionId: string) {
  return createVisitorSupabase({ 'x-session-id': sessionId });
}
