import type { AgentInputItem, Session } from '@openai/agents'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

type SupabaseClient = ReturnType<typeof createMoniServiceRoleClient>

type SupabaseMoniSessionOptions = {
  supabase: SupabaseClient
  businessId: string
  threadId: string
  excludeBootstrapMessageId?: string
  bootstrapLimit?: number
}

const MAX_SESSION_ROWS = 500
const text = (value: unknown, max = 6000) => String(value ?? '').trim().slice(0, max)

function itemType(item: AgentInputItem) {
  const value = item as Record<string, unknown>
  if (typeof value.type === 'string') return value.type.slice(0, 80)
  if (typeof value.role === 'string') return `message:${value.role}`.slice(0, 80)
  return 'unknown'
}

function messageToInputItem(role: 'user' | 'assistant', content: string): AgentInputItem {
  return {
    role,
    content: [{ type: role === 'assistant' ? 'output_text' : 'input_text', text: content }],
  } as AgentInputItem
}

function canonicalConversationItem(raw: unknown): AgentInputItem | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>
  const role = value.role === 'assistant' ? 'assistant' : value.role === 'user' ? 'user' : null
  if (!role) return null
  if (typeof value.type === 'string' && value.type !== 'message') return null

  const content = Array.isArray(value.content) ? value.content : []
  const combined = content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      const item = part as Record<string, unknown>
      if (!['input_text', 'output_text', 'text'].includes(String(item.type || ''))) return ''
      return text(item.text)
    })
    .filter(Boolean)
    .join('\n')
    .trim()
  if (!combined) return null
  return messageToInputItem(role, combined)
}

export function selectReplaySafeSessionItems(items: unknown[], limit = 24): AgentInputItem[] {
  const messageLimit = Math.max(1, Math.min(50, limit))
  return items
    .map(canonicalConversationItem)
    .filter((item): item is AgentInputItem => Boolean(item))
    .slice(-messageLimit)
}

export class SupabaseMoniSession implements Session {
  private readonly supabase: SupabaseClient
  private readonly businessId: string
  private readonly threadId: string
  private readonly excludeBootstrapMessageId?: string
  private readonly bootstrapLimit: number

  constructor(options: SupabaseMoniSessionOptions) {
    this.supabase = options.supabase
    this.businessId = options.businessId
    this.threadId = options.threadId
    this.excludeBootstrapMessageId = options.excludeBootstrapMessageId
    this.bootstrapLimit = Math.max(1, Math.min(50, options.bootstrapLimit || 24))
  }

  async getSessionId() {
    return this.threadId
  }

  async getItems(limit?: number): Promise<AgentInputItem[]> {
    const messageLimit = Math.max(1, Math.min(50, limit || this.bootstrapLimit))
    const rowLimit = Math.max(100, Math.min(MAX_SESSION_ROWS, messageLimit * 20))
    let { data, error } = await this.supabase
      .from('moni_ai_session_items')
      .select('item')
      .eq('business_id', this.businessId)
      .eq('thread_id', this.threadId)
      .order('id', { ascending: false })
      .limit(rowLimit)
    if (error) throw new Error(error.message)

    if (!data?.length) {
      await this.bootstrapFromMessages()
      const retry = await this.supabase
        .from('moni_ai_session_items')
        .select('item')
        .eq('business_id', this.businessId)
        .eq('thread_id', this.threadId)
        .order('id', { ascending: false })
        .limit(rowLimit)
      if (retry.error) throw new Error(retry.error.message)
      data = retry.data
    }

    return selectReplaySafeSessionItems((data ?? []).reverse().map((row) => row.item), messageLimit)
  }

  async addItems(items: AgentInputItem[]) {
    if (!items.length) return
    const rows = items.map((item) => ({
      business_id: this.businessId,
      thread_id: this.threadId,
      source_message_id: null,
      item_type: itemType(item),
      item,
    }))
    const { error } = await this.supabase.from('moni_ai_session_items').insert(rows)
    if (error) throw new Error(error.message)
  }

  async popItem(): Promise<AgentInputItem | undefined> {
    const { data, error } = await this.supabase
      .from('moni_ai_session_items')
      .select('id,item')
      .eq('business_id', this.businessId)
      .eq('thread_id', this.threadId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return undefined
    const { error: deleteError } = await this.supabase
      .from('moni_ai_session_items')
      .delete()
      .eq('id', data.id)
    if (deleteError) throw new Error(deleteError.message)
    return data.item as AgentInputItem
  }

  async clearSession() {
    const { error } = await this.supabase
      .from('moni_ai_session_items')
      .delete()
      .eq('business_id', this.businessId)
      .eq('thread_id', this.threadId)
    if (error) throw new Error(error.message)
  }

  private async bootstrapFromMessages() {
    let query = this.supabase
      .from('moni_ai_messages')
      .select('id,role,content,created_at')
      .eq('business_id', this.businessId)
      .eq('thread_id', this.threadId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: false })
      .limit(this.bootstrapLimit)
    if (this.excludeBootstrapMessageId) query = query.neq('id', this.excludeBootstrapMessageId)
    const { data, error } = await query
    if (error) throw new Error(error.message)

    for (const row of (data ?? []).reverse()) {
      const role = row.role === 'assistant' ? 'assistant' : 'user'
      const content = text(row.content)
      if (!content) continue
      const item = messageToInputItem(role, content)
      const { error: insertError } = await this.supabase
        .from('moni_ai_session_items')
        .insert({
          business_id: this.businessId,
          thread_id: this.threadId,
          source_message_id: row.id,
          item_type: itemType(item),
          item,
        })
      if (insertError && insertError.code !== '23505') throw new Error(insertError.message)
    }
  }
}
