import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

console.log('--- SUPABASE INFRA HEALTHCHECK ---');
console.log('URL defined:', !!url);
console.log('Key defined:', !!key);

if (!url || !key) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
  console.log('Testing Auth endpoint...');
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) {
    console.error('❌ Auth failure:', authError.message);
  } else {
    console.log('✅ Auth reachable');
  }

  console.log('Testing Database (public.profiles)...');
  const { data: dbData, error: dbError } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
  if (dbError) {
    console.error('❌ Database failure:', dbError.message);
  } else {
    console.log('✅ Database reachable');
  }

  console.log('Testing Storage...');
  const { data: storageData, error: storageError } = await supabase.storage.listBuckets();
  if (storageError) {
    console.error('❌ Storage failure:', storageError.message);
  } else {
    console.log('✅ Storage reachable');
  }
}

check();
