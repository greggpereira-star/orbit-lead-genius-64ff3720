import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!
)

async function test() {
  const { data, error } = await supabase.from('companies').select('count', { count: 'exact', head: true })
  if (error) {
    console.error('Error connecting to Supabase:', error.message)
    process.exit(1)
  }
  console.log('Successfully connected to Supabase. Company count:', data)
}

test()
