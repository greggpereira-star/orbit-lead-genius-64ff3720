import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;
// For simulation, we'd need a service role key to clean up, 
// but for RLS auditing we use a test user.

const testEmail = `audit-${Math.random().toString(36).substring(7)}@example.com`;
const testPassword = 'AuditPassword123!';

async function audit() {
  console.log('🚀 Starting Forensic RLS Audit...');
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // 1. Signup
  console.log('--- Step 1: Signup ---');
  const { data: authData, error: signupError } = await supabase.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: { data: { company_name: 'Audit Corp', full_name: 'Auditor' } }
  });

  if (signupError) {
    console.error('❌ Signup BLOCKED by Auth/RLS:', signupError.message);
  } else {
    console.log('✅ Signup successful. User ID:', authData.user?.id);
  }

  const userId = authData.user?.id;
  if (!userId) return;

  // Wait for triggers
  console.log('⏳ Waiting for database triggers...');
  await new Promise(r => setTimeout(r, 2000));

  // 2. Audit Profiles
  console.log('--- Step 2: Profiles Table ---');
  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (profileError) console.error('❌ Profiles SELECT blocked:', profileError.message);
  else if (!profile) console.error('❌ Profiles SELECT failed: Row not found (Trigger fail?)');
  else console.log('✅ Profiles accessible');

  // 3. Audit Memberships
  console.log('--- Step 3: Memberships Table ---');
  const { data: memberships, error: membError } = await supabase.from('memberships').select('*').eq('user_id', userId);
  if (membError) console.error('❌ Memberships SELECT blocked:', membError.message);
  else console.log('✅ Memberships accessible. Count:', memberships?.length);

  const companyId = memberships?.[0]?.company_id;
  if (!companyId) {
    console.error('❌ Audit ABORTED: No company context found. Check handle_new_user trigger.');
    return;
  }

  // 4. Audit Companies
  console.log('--- Step 4: Companies Table ---');
  const { data: company, error: compError } = await supabase.from('companies').select('*').eq('id', companyId).maybeSingle();
  if (compError) console.error('❌ Companies SELECT blocked:', compError.message);
  else console.log('✅ Company context accessible:', company?.name);

  // 5. Audit Functional Tables (Leads, Stages)
  console.log('--- Step 5: Functional Tables ---');
  const { error: leadInsertError } = await supabase.from('leads').insert({
    company_id: companyId,
    name: 'Audit Lead',
    email: 'lead@audit.com'
  });
  if (leadInsertError) console.error('❌ Leads INSERT blocked:', leadInsertError.message);
  else console.log('✅ Leads INSERT working');

  console.log('🏁 Audit Complete.');
}

audit();
