import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const STATUS_VALUES = [
  'OPEN',
  'ACKNOWLEDGED',
  'TRIAGED',
  'APPROVED',
  'IN_PROGRESS',
  'IN_DEVELOPMENT',
  'PREVIEW_TESTING',
  'PMO_REVIEW',
  'RESOLVED',
  'REJECTED',
  'DISMISSED',
] as const

type Status = typeof STATUS_VALUES[number]

const transitions: Record<Status, Status[]> = {
  OPEN: ['ACKNOWLEDGED', 'TRIAGED', 'DISMISSED'],
  ACKNOWLEDGED: ['TRIAGED', 'IN_PROGRESS', 'DISMISSED'],
  TRIAGED: ['APPROVED', 'REJECTED', 'DISMISSED'],
  APPROVED: ['IN_PROGRESS', 'IN_DEVELOPMENT', 'REJECTED'],
  IN_PROGRESS: ['IN_DEVELOPMENT', 'PMO_REVIEW', 'RESOLVED', 'REJECTED'],
  IN_DEVELOPMENT: ['PREVIEW_TESTING', 'REJECTED'],
  PREVIEW_TESTING: ['PMO_REVIEW', 'IN_DEVELOPMENT', 'REJECTED'],
  PMO_REVIEW: ['RESOLVED', 'IN_DEVELOPMENT', 'REJECTED'],
  RESOLVED: ['OPEN'],
  REJECTED: ['OPEN'],
  DISMISSED: ['OPEN'],
}

const PatchSchema = z.object({
  event_id: z.string().uuid(),
  status: z.enum(STATUS_VALUES).optional(),
  note: z.string().trim().max(4000).optional(),
  pmo_notes: z.string().trim().max(8000).nullable().optional(),
  resolution: z.string().trim().max(8000).nullable().optional(),
  validation_status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'NOT_REQUIRED']).optional(),
  validator_name: z.string().trim().max(160).nullable().optional(),
  recommended_owner: z.string().trim().max(160).nullable().optional(),
  github_issue_number: z.number().int().positive().nullable().optional(),
  github_issue_url: z.string().url().max(1000).nullable().optional(),
  development_pr_number: z.number().int().positive().nullable().optional(),
  deployment_id: z.string().trim().max(200).nullable().optional(),
  resolution_evidence: z.record(z.string(), z.unknown()).optional(),
})

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { error: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (String(session.role).toLowerCase() !== 'admin') {
    return { error: NextResponse.json({ ok: false, error: 'PMO 사건 관리는 관리자만 사용할 수 있습니다.' }, { status: 403 }) }
  }
  return { session }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error
  const supabase = createMoniServiceRoleClient()
  const params = request.nextUrl.searchParams
  const status = params.get('status')?.trim().toUpperCase()
  const severity = params.get('severity')?.trim().toUpperCase()
  const limit = Math.max(1, Math.min(100, Number(params.get('limit') || 30)))

  let query = supabase
    .from('moni_ai_pmo_events')
    .select('*')
    .eq('business_id', BUSINESS_ID)
    .order('last_seen_at', { ascending: false })
    .limit(limit)
  if (status && STATUS_VALUES.includes(status as Status)) query = query.eq('status', status)
  if (severity && ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) query = query.eq('severity', severity)
  const { data: events, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const eventIds = (events ?? []).map((event) => event.id)
  const { data: transitionsData, error: transitionError } = eventIds.length
    ? await supabase
        .from('moni_ai_pmo_event_transitions')
        .select('*')
        .in('event_id', eventIds)
        .order('id', { ascending: false })
        .limit(limit * 10)
    : { data: [], error: null }
  if (transitionError) return NextResponse.json({ ok: false, error: transitionError.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    events: events ?? [],
    transitions: transitionsData ?? [],
    allowed_transitions: transitions,
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return auth.error
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'PMO 사건 변경 요청 형식이 올바르지 않습니다.', details: parsed.error.flatten() }, { status: 400 })
  }

  const supabase = createMoniServiceRoleClient()
  const input = parsed.data
  const { data: current, error: readError } = await supabase
    .from('moni_ai_pmo_events')
    .select('*')
    .eq('id', input.event_id)
    .eq('business_id', BUSINESS_ID)
    .maybeSingle()
  if (readError) return NextResponse.json({ ok: false, error: readError.message }, { status: 500 })
  if (!current) return NextResponse.json({ ok: false, error: 'PMO 사건을 찾을 수 없습니다.' }, { status: 404 })

  if (input.status && input.status !== current.status) {
    const allowed = transitions[current.status as Status] || []
    if (!allowed.includes(input.status)) {
      return NextResponse.json({
        ok: false,
        error: `${current.status}에서 ${input.status}(으)로 바로 변경할 수 없습니다.`,
        allowed_transitions: allowed,
      }, { status: 409 })
    }
  }

  const now = new Date().toISOString()
  const evidence = {
    ...(current.evidence || {}),
    transition_actor_type: 'GPT_PMO',
    transition_actor_id: auth.session.loginId,
    transition_note: input.note || null,
  }
  const update: Record<string, unknown> = {
    evidence,
    updated_at: now,
  }
  for (const key of [
    'status',
    'pmo_notes',
    'resolution',
    'validation_status',
    'validator_name',
    'recommended_owner',
    'github_issue_number',
    'github_issue_url',
    'development_pr_number',
    'deployment_id',
    'resolution_evidence',
  ] as const) {
    if (key in input) update[key] = input[key]
  }
  if (input.validation_status === 'VERIFIED') update.validated_at = now
  if (input.status) update.resolved_at = input.status === 'RESOLVED' ? now : null

  const { data, error } = await supabase
    .from('moni_ai_pmo_events')
    .update(update)
    .eq('id', input.event_id)
    .eq('business_id', BUSINESS_ID)
    .select('*')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, event: data })
}
