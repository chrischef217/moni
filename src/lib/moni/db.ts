import { createClient } from '@supabase/supabase-js'

const LEGACY_SUPABASE_URL = 'https://nvzxlejpmsfzbpprgvfh.supabase.co'
const LEGACY_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dvlB9GtrobIRjRipY6G-dg_78hIy_EZ'

function readEnv(name: string) {
  return process.env[name]?.trim() ?? ''
}

function resolveSupabaseSetting(name: string, legacyValue: string) {
  const configuredValue = readEnv(name)
  if (configuredValue) return configuredValue

  if (process.env.NODE_ENV !== 'production') {
    return legacyValue
  }

  throw new Error(`${name} environment variable is not configured.`)
}

const supabaseUrl = resolveSupabaseSetting('NEXT_PUBLIC_SUPABASE_URL', LEGACY_SUPABASE_URL)
const supabaseAnonKey = resolveSupabaseSetting('NEXT_PUBLIC_SUPABASE_ANON_KEY', LEGACY_SUPABASE_PUBLISHABLE_KEY)
const supabaseServiceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY') || supabaseAnonKey

export const moniDb = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'public' },
})

export const moniAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'public' },
  auth: { persistSession: false },
})

export function createMoniServiceRoleClient() {
  const serviceRoleKey = readEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is not configured.')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: 'public' },
    auth: { persistSession: false },
  })
}
