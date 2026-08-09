import type { createMoniServiceRoleClient } from '@/lib/moni/db'

type SupabaseClient = ReturnType<typeof createMoniServiceRoleClient>

export type MoniAgentPageContext = {
  pathname?: string
  search?: string
  title?: string
  headings?: string[]
}

export type MoniAgentSession = {
  loginId: string
  displayName?: string | null
  role: string
}

export type MoniAgentToolContext = {
  supabase: SupabaseClient
  businessId: string
  threadId: string
  messageId: string
  page: MoniAgentPageContext
  session: MoniAgentSession
}
