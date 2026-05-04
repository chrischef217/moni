import { createClient } from '@supabase/supabase-js'

const DEFAULT_SUPABASE_URL = 'https://nvzxlejpmsfzbpprgvfh.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dvlB9GtrobIRjRipY6G-dg_78hIy_EZ'

const supabaseUrl = DEFAULT_SUPABASE_URL
const supabaseAnonKey = DEFAULT_SUPABASE_PUBLISHABLE_KEY
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseAnonKey

export const moniDb = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'public' },
})

export const moniAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'public' },
  auth: { persistSession: false },
})
