'use client'

import { createClient } from '@supabase/supabase-js'

const FALLBACK_SUPABASE_URL = 'https://nvzxlejpmsfzbpprgvfh.supabase.co'
const FALLBACK_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_dvlB9GtrobIRjRipY6G-dg_78hIy_EZ'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_SUPABASE_PUBLISHABLE_KEY

export const moniBrowserDb = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})
