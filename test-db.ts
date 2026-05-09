import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
    console.log('--- DB INSPECTION ---');
    const { data: companies, error: compErr } = await supabase.from('companies').select('*').limit(5);
    console.log('Companies:', companies, compErr);

    const { data: profiles, error: profErr } = await supabase.from('profiles').select('*').limit(5);
    console.log('Profiles:', profiles, profErr);

    const { data: memberships, error: membErr } = await supabase.from('memberships').select('*').limit(5);
    console.log('Memberships:', memberships, membErr);
}

run();
