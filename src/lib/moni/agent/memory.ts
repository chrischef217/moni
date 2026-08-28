import { Agent, run } from '@openai/agents'
import { z } from 'zod'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

type SupabaseClient = ReturnType<typeof createMoniServiceRoleClient>

const MEMORY_REFRESH_MESSAGE_DELTA = 12
const MEMORY_SOURCE_LIMIT = 48
const CAPABILITY_PREFETCH_LIMIT = 3
const CAPABILITY_PREFETCH_MIN_SCORE = 60

const ThreadMemoryOutputSchema = z.object({
  summary: z.string().max(6000),
  salient_facts: z.array(z.string().min(1).max(600)).max(30),
  open_items: z.array(z.string().min(1).max(600)).max(20),
  decisions: z.array(z.string().min(1).max(600)).max(20),
})

export type CapabilityPrefetch = {
  featureId: string
  featureName: string
  category: string
  aliases: string[]
  keywords: string[]
  pcPath: string[]
  mobileSupport: string
  mobilePath: string[]
  actionHint: string
  description: string
  caveats: string[]
  permissions: string[]
  sourceReference?: string | null
  matchScore: number
}

export type ThreadMemory = {
  summary: string
  salientFacts: string[]
  openItems: string[]
  decisions: string[]
  summarizedMessageCount: number
  memoryVersion: number
  lastSummarizedAt?: string | null
  capabilityPrefetch?: CapabilityPrefetch[]
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

function isCapabilityHowToQuestion(value: string) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return false
  return /(어디서|어디야|어디에|어디로|어디\s*있|어디\s*보|어디\s*봐|어떻게|무슨\s*메뉴|어느\s*메뉴|메뉴\s*(?:어디|경로|위치)|경로|사용법|방법|어디\s*관리|어디\s*등록|어디\s*수정|어디\s*변경|어디\s*설정|어디\s*다운로드)/i.test(normalized)
}

function mapCapabilityRows(rows: any[]): CapabilityPrefetch[] {
  return rows
    .map((row: any) => ({
      featureId: text(row?.feature_id, 160),
      featureName: text(row?.feature_name, 240),
      category: text(row?.category, 80),
      aliases: stringArray(row?.aliases, 20),
      keywords: stringArray(row?.keywords, 30),
      pcPath: stringArray(row?.pc_path, 12),
      mobileSupport: text(row?.mobile_support, 40),
      mobilePath: stringArray(row?.mobile_path, 12),
      actionHint: text(row?.action_hint, 800),
      description: text(row?.description, 1200),
      caveats: stringArray(row?.caveats, 20),
      permissions: stringArray(row?.permissions, 20),
      sourceReference: row?.source_reference ? text(row.source_reference, 300) : null,
      matchScore: Number(row?.match_score || 0),
    }))
    .filter((row) => row.featureId && row.featureName && row.matchScore >= CAPABILITY_PREFETCH_MIN_SCORE)
    .slice(0, CAPABILITY_PREFETCH_LIMIT)
}

async function searchCapabilityPrefetch(supabase: SupabaseClient, businessId: string, query: string) {
  const { data, error } = await supabase.rpc('search_moni_capabilities', {
    p_business_id: businessId,
    p_query: text(query, 1800),
    p_limit: CAPABILITY_PREFETCH_LIMIT,
  })
  if (error) {
    console.error('[MONI_CAPABILITY_PREFETCH_RPC_ERROR]', { businessId, message: error.message })
    return [] as CapabilityPrefetch[]
  }
  return mapCapabilityRows((data ?? []) as any[])
}

async function loadCapabilityPrefetch(supabase: SupabaseClient, businessId: string, threadId: string) {
  const { data, error } = await supabase
    .from('moni_ai_messages')
    .select('role,content,created_at')
    .eq('business_id', businessId)
    .eq('thread_id', threadId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) {
    console.error('[MONI_CAPABILITY_PREFETCH_HISTORY_ERROR]', { businessId, threadId, message: error.message })
    return [] as CapabilityPrefetch[]
  }

  const rows = data ?? []
  const latestUserIndex = rows.findIndex((row: any) => row.role === 'user')
  if (latestUserIndex < 0) return []
  const currentQuestion = text((rows[latestUserIndex] as any)?.content, 1400)
  if (!isCapabilityHowToQuestion(currentQuestion)) return []

  const direct = await searchCapabilityPrefetch(supabase, businessId, currentQuestion)
  if (direct[0]?.matchScore >= 80) return direct

  const fallbackContext = rows
    .slice(latestUserIndex, Math.min(rows.length, latestUserIndex + 4))
    .map((row: any) => text(row?.content, 500))
    .filter(Boolean)
    .join('\n')
  if (!fallbackContext || fallbackContext === currentQuestion) return direct

  const contextual = await searchCapabilityPrefetch(supabase, businessId, `${currentQuestion}\n${fallbackContext}`)
  if (!contextual.length) return direct
  if (!direct.length || contextual[0].matchScore > direct[0].matchScore) return contextual
  return direct
}

export async function loadThreadMemory(supabase: SupabaseClient, businessId: string, threadId: string): Promise<ThreadMemory> {
  const [{ data, error }, capabilityPrefetch] = await Promise.all([
    supabase
      .from('moni_ai_thread_memory')
      .select('summary,salient_facts,open_items,decisions,summarized_message_count,memory_version,last_summarized_at')
      .eq('business_id', businessId)
      .eq('thread_id', threadId)
      .maybeSingle(),
    loadCapabilityPrefetch(supabase, businessId, threadId),
  ])
  if (error) throw new Error(error.message)
  return {
    summary: text(data?.summary),
    salientFacts: stringArray(data?.salient_facts, 30),
    openItems: stringArray(data?.open_items, 20),
    decisions: stringArray(data?.decisions, 20),
    summarizedMessageCount: Number(data?.summarized_message_count || 0),
    memoryVersion: Number(data?.memory_version || 1),
    lastSummarizedAt: data?.last_summarized_at || null,
    capabilityPrefetch,
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
  if (memory.capabilityPrefetch?.length) {
    sections.push('', '[MONI 기능 레지스트리 자동조회 · 서버 prefetch]')
    sections.push('현재 사용법·메뉴·경로 질문을 기준으로 서버가 모델 실행 전에 조회한 공식 기능 정보입니다. 아래 결과를 우선 사용하고, 등록되지 않은 메뉴·경로를 추측하지 않습니다.')
    memory.capabilityPrefetch.forEach((item, index) => {
      const lines = [
        `${index + 1}. ${item.featureName} (${item.featureId})`,
        item.pcPath.length ? `PC 경로: ${item.pcPath.join(' → ')}` : '',
        `모바일 지원: ${item.mobileSupport || 'NOT_VERIFIED'}`,
        item.mobilePath.length ? `모바일 경로: ${item.mobilePath.join(' → ')}` : '',
        item.actionHint ? `실행/입력 위치: ${item.actionHint}` : '',
        item.description ? `설명: ${item.description}` : '',
        item.caveats.length ? `주의: ${item.caveats.join(' | ')}` : '',
        item.permissions.length ? `권한: ${item.permissions.join(', ')}` : '',
        item.sourceReference ? `근거: ${item.sourceReference}` : '',
        `검색점수: ${item.matchScore}`,
      ].filter(Boolean)
      sections.push(lines.join('\n'))
    })
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

  const { capabilityPrefetch: _runtimeCapabilityPrefetch, ...persistentExistingMemory } = existingMemory
  const transcript = ordered.map((item) => `[${item.role}] ${text(item.content, 2400)}`).join('\n\n')
  const result = await run(memoryAgent, `기존 메모리:\n${JSON.stringify(persistentExistingMemory)}\n\n새 대화 기록:\n${transcript}`, { maxTurns: 2 })
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
