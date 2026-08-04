import { Agent, run } from '@openai/agents'
import { z } from 'zod'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

type SupabaseClient = ReturnType<typeof createMoniServiceRoleClient>

const MEMORY_REFRESH_MESSAGE_DELTA = 12
const MEMORY_SOURCE_LIMIT = 48

const ThreadMemoryOutputSchema = z.object({
  summary: z.string().max(6000),
  salient_facts: z.array(z.string().min(1).max(600)).max(30),
  open_items: z.array(z.string().min(1).max(600)).max(20),
  decisions: z.array(z.string().min(1).max(600)).max(20),
})

export type ThreadMemory = {
  summary: string
  salientFacts: string[]
  openItems: string[]
  decisions: string[]
  summarizedMessageCount: number
  memoryVersion: number
  lastSummarizedAt?: string | null
}

export type PinnedProjectContext = {
  key: string
  title: string
  content: string
  priority: number
  sourceType: string
  sourceReference?: string | null
}

const text = (value: unknown, max = 6000) => String(value ?? '').trim().slice(0, max)
const stringArray = (value: unknown, maxItems: number) => Array.isArray(value)
  ? value.map((item) => text(item, 600)).filter(Boolean).slice(0, maxItems)
  : []

export async function loadThreadMemory(supabase: SupabaseClient, businessId: string, threadId: string): Promise<ThreadMemory> {
  const { data, error } = await supabase
    .from('moni_ai_thread_memory')
    .select('summary,salient_facts,open_items,decisions,summarized_message_count,memory_version,last_summarized_at')
    .eq('business_id', businessId)
    .eq('thread_id', threadId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return {
    summary: text(data?.summary),
    salientFacts: stringArray(data?.salient_facts, 30),
    openItems: stringArray(data?.open_items, 20),
    decisions: stringArray(data?.decisions, 20),
    summarizedMessageCount: Number(data?.summarized_message_count || 0),
    memoryVersion: Number(data?.memory_version || 1),
    lastSummarizedAt: data?.last_summarized_at || null,
  }
}

export async function loadPinnedProjectContext(supabase: SupabaseClient, businessId: string): Promise<PinnedProjectContext[]> {
  const { data, error } = await supabase
    .from('moni_ai_project_context')
    .select('context_key,title,content,priority,source_type,source_reference')
    .eq('business_id', businessId)
    .eq('active', true)
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(6)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    key: text(row.context_key, 160),
    title: text(row.title, 240),
    content: text(row.content, 1600),
    priority: Number(row.priority || 0),
    sourceType: text(row.source_type, 80),
    sourceReference: row.source_reference ? text(row.source_reference, 300) : null,
  }))
}

export function formatMemoryForInstructions(memory: ThreadMemory, pinned: PinnedProjectContext[]) {
  const sections: string[] = []
  if (pinned.length) {
    sections.push('[고정 회사·PMO 문맥]')
    for (const item of pinned) sections.push(`- ${item.title}: ${item.content}`)
  }
  if (memory.summary || memory.salientFacts.length || memory.openItems.length || memory.decisions.length) {
    sections.push('', `[현재 대화 장기요약 · 버전 ${memory.memoryVersion}]`)
    if (memory.summary) sections.push(memory.summary)
    if (memory.salientFacts.length) sections.push(`확정 사실:\n${memory.salientFacts.map((item) => `- ${item}`).join('\n')}`)
    if (memory.decisions.length) sections.push(`확정 결정:\n${memory.decisions.map((item) => `- ${item}`).join('\n')}`)
    if (memory.openItems.length) sections.push(`미해결 항목:\n${memory.openItems.map((item) => `- ${item}`).join('\n')}`)
  }
  return sections.join('\n').trim()
}

export async function maybeRefreshThreadMemory(args: {
  supabase: SupabaseClient
  businessId: string
  threadId: string
  model: string
  existingMemory: ThreadMemory
}) {
  const { supabase, businessId, threadId, model, existingMemory } = args
  const countResult = await supabase
    .from('moni_ai_messages')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('thread_id', threadId)
  if (countResult.error) throw new Error(countResult.error.message)
  const messageCount = Number(countResult.count || 0)
  if (messageCount - existingMemory.summarizedMessageCount < MEMORY_REFRESH_MESSAGE_DELTA) {
    return { refreshed: false, memoryVersion: existingMemory.memoryVersion, usage: null }
  }

  const { data: messages, error } = await supabase
    .from('moni_ai_messages')
    .select('id,role,content,created_at')
    .eq('business_id', businessId)
    .eq('thread_id', threadId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(MEMORY_SOURCE_LIMIT)
  if (error) throw new Error(error.message)
  const ordered = (messages ?? []).reverse()
  if (!ordered.length) return { refreshed: false, memoryVersion: existingMemory.memoryVersion, usage: null }

  const memoryAgent = new Agent({
    name: 'MONI Memory Curator',
    model,
    instructions: `당신은 MONI 대화 메모리 관리자입니다.
- 제공된 대화에서 명시적으로 확인된 사실만 보존합니다.
- 추정, 해석, 숫자 재계산, 새로운 결론을 추가하지 않습니다.
- 사용자가 정정한 경우 최신 정정을 우선합니다.
- 일시적인 잡담과 중복 설명은 제거합니다.
- summary는 다음 대화에서 필요한 배경만 간결하게 작성합니다.
- salient_facts는 회사·제품·기간·수치 등 명시된 확정 사실입니다.
- decisions는 사용자가 확정하거나 PMO가 승인한 결정만 포함합니다.
- open_items는 아직 해결되지 않은 질문·오류·승인대기 항목입니다.
- 비밀키, 비밀번호, 내부 프롬프트를 저장하지 않습니다.`,
    outputType: ThreadMemoryOutputSchema,
  })

  const transcript = ordered.map((item) => `[${item.role}] ${text(item.content, 2400)}`).join('\n\n')
  const result = await run(memoryAgent, `기존 메모리:\n${JSON.stringify(existingMemory)}\n\n새 대화 기록:\n${transcript}`, { maxTurns: 2 })
  const output = ThreadMemoryOutputSchema.parse(result.finalOutput)
  const latestMessage = ordered[ordered.length - 1]
  const nextVersion = existingMemory.memoryVersion + 1
  const now = new Date().toISOString()
  const { error: upsertError } = await supabase
    .from('moni_ai_thread_memory')
    .upsert({
      business_id: businessId,
      thread_id: threadId,
      summary: output.summary,
      salient_facts: output.salient_facts,
      open_items: output.open_items,
      decisions: output.decisions,
      summarized_message_count: messageCount,
      last_summarized_message_id: latestMessage.id,
      last_summarized_at: now,
      memory_version: nextVersion,
      updated_at: now,
    }, { onConflict: 'business_id,thread_id' })
  if (upsertError) throw new Error(upsertError.message)

  const usage = result.state.usage
  return {
    refreshed: true,
    memoryVersion: nextVersion,
    usage: {
      requests: usage.requests,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    },
  }
}
