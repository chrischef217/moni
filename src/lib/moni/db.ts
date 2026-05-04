import { createClient } from '@supabase/supabase-js'

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
const supabaseAnonKey = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseAnonKey

export const moniDb = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'public' },
})

export const moniAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'public' },
  auth: { persistSession: false },
})
