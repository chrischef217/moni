import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import type { MoniAgentPageContext, MoniAgentSession } from '@/lib/moni/agent-v2'

type SupabaseClient = ReturnType<typeof createMoniServiceRoleClient>

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)

export const PmoEventInputSchema = z.object({
  event_type: z.enum(['BUG', 'IMPROVEMENT', 'DATA_QUALITY', 'SECURITY', 'TOOL_FAILURE', 'CAPABILITY_GAP']),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(4000),
  evidence: z.record(z.string(), z.unknown()).default({}),
  detection_source: z.enum(['SYSTEM_DETECTED', 'USER_REPORTED', 'MODEL_SUSPECTED', 'VALIDATOR_DETECTED']).default('MODEL_SUSPECTED'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  validation_status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'NOT_REQUIRED']).default('PENDING'),
  validator_name: z.string().trim().max(160).nullable().optional(),
  recommended_owner: z.string().trim().max(160).nullable().optional(),
})

export type PmoEventInput = z.infer<typeof PmoEventInputSchema>

export type PmoEventContext = {
  supabase: SupabaseClient
  businessId: string
  threadId?: string | null
  messageId?: string | null
  agentRunId?: string | null
  page?: MoniAgentPageContext
  session?: MoniAgentSession
}

function evidenceKey(evidence: Record<string, unknown>) {
  const affectedIds = Array.isArray(evidence.affected_record_ids)
    ? evidence.affected_record_ids.map((item) => text(item, 100)).filter(Boolean).sort().join(',')
    : ''
  return text(
    evidence.tool_name
      || evidence.error_code
      || evidence.table
      || evidence.capability
      || affectedIds,
    300,
  )
}

function eventFingerprint(input: PmoEventInput, context: PmoEventContext) {
  const raw = [
    input.event_type,
    input.title.toLowerCase().replace(/\s+/g, ' '),
    context.page?.pathname || '',
    evidenceKey(input.evidence),
  ].join('|')
  return createHash('sha256').update(raw).digest('hex')
}

export async function reportPmoEvent(context: PmoEventContext, raw: unknown) {
  const input = PmoEventInputSchema.parse(raw)
  const fingerprint = eventFingerprint(input, context)
  const now = new Date().toISOString()
  const page = context.page || {}
  const evidence = {
    ...input.evidence,
    detection_source: input.detection_source,
    agent_run_id: context.agentRunId || null,
    user_login_id: context.session?.loginId || null,
  }

  const { data: existing, error: readError } = await context.supabase
    .from('moni_ai_pmo_events')
    .select('id,status,occurrence_count,validation_status')
    .eq('business_id', context.businessId)
    .eq('fingerprint', fingerprint)
    .maybeSingle()
  if (readError) throw new Error(readError.message)

  if (existing) {
    const nextStatus = ['RESOLVED', 'REJECTED', 'DISMISSED'].includes(existing.status) ? 'OPEN' : existing.status
    const nextValidation = input.validation_status === 'VERIFIED'
      ? 'VERIFIED'
      : existing.validation_status || input.validation_status
    const { data, error } = await context.supabase
      .from('moni_ai_pmo_events')
      .update({
        thread_id: context.threadId || null,
        message_id: context.messageId || null,
        agent_run_id: context.agentRunId || null,
        event_type: input.event_type,
        severity: input.severity,
        status: nextStatus,
        title: input.title,
        summary: input.summary,
        page_context: page,
        evidence,
        detection_source: input.detection_source,
        confidence: input.confidence ?? null,
        validation_status: nextValidation,
        validator_name: input.validator_name ?? null,
        validated_at: nextValidation === 'VERIFIED' ? now : null,
        recommended_owner: input.recommended_owner ?? null,
        occurrence_count: Number(existing.occurrence_count || 0) + 1,
        last_seen_at: now,
        updated_at: now,
        resolved_at: nextStatus === 'OPEN' ? null : undefined,
      })
      .eq('id', existing.id)
      .select('id,status,severity,validation_status,occurrence_count,last_seen_at')
      .single()
    if (error) throw new Error(error.message)
    return { ok: true, event: data, deduplicated: true }
  }

  const { data, error } = await context.supabase
    .from('moni_ai_pmo_events')
    .insert({
      business_id: context.businessId,
      thread_id: context.threadId || null,
      message_id: context.messageId || null,
      agent_run_id: context.agentRunId || null,
      event_type: input.event_type,
      severity: input.severity,
      title: input.title,
      summary: input.summary,
      fingerprint,
      page_context: page,
      evidence,
      detection_source: input.detection_source,
      confidence: input.confidence ?? null,
      validation_status: input.validation_status,
      validator_name: input.validator_name ?? null,
      validated_at: input.validation_status === 'VERIFIED' ? now : null,
      recommended_owner: input.recommended_owner ?? null,
    })
    .select('id,status,severity,validation_status,occurrence_count,last_seen_at')
    .single()
  if (error) throw new Error(error.message)
  return { ok: true, event: data, deduplicated: false }
}
