 import { createClient } from '@supabase/supabase-js';
 
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL || 'https://placeholder-url.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.SUPABASE_ANON_KEY || 'placeholder-key';
 
 if (!supabaseUrl || !supabaseAnonKey) {
   console.warn('Supabase credentials missing. Database features will be unavailable.');
 }
 
 // Only create client if URL is provided to avoid crashing the server
 export const supabase = supabaseUrl 
   ? createClient(supabaseUrl, supabaseAnonKey) 
   : (null as any);