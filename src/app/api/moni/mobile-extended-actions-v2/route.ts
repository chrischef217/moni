import { NextRequest, NextResponse } from 'next/server'
import { GET as legacyGET, POST as legacyPOST } from '@/app/api/moni/mobile-extended-actions/route'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileExtendedIntent } from '@/lib/moni/mobile-extended-intents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const text = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max)
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))

function actionDomain(domain: string) { return `mobile_pc_form_${domain}` }
function semanticAction(operation: string) { return operation === 'DELETE' ? 'DELETE' : operation === 'CREATE' ? 'CREATE' : 'UPDATE' }

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

async function latestUserMessage(threadId: string, loginId: string) {
  const db = createMoniServiceRoleClient()
  const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', loginId).eq('status', 'ACTIVE').maybeSingle()
  if (thread.error) throw new Error(thread.error.message)
  if (!thread.data) throw new Error('현재 MONI 대화방을 확인할 수 없습니다.')
  const messages = await db.from('moni_ai_messages').select('id,role,content,created_at').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).order('created_at', { ascending: false }).limit(18)
  if (messages.error) throw new Error(messages.error.message)
  return (messages.data ?? []).find((row: any) => row.role === 'user') || null
}

async function pcApi(request: NextRequest, path: string, method: string, body?: unknown) {
  const url = new URL(path, request.url)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const cookie = request.headers.get('cookie')
  if (cookie) headers.cookie = cookie
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok || payload?.ok === false) throw new Error(text(payload?.error, 1800) || `${path} 처리 실패 (${response.status})`)
  return payload
}

async function augmentDraft(payload: Record<string, any>) {
  const card = payload.card
  if (!card || card.stage !== 'draft' || !['business_activity', 'business_work_log'].includes(card.domain)) return payload
  const db = createMoniServiceRoleClient()

  if (card.domain === 'business_activity') {
    const rows = await db.from('sales_activities').select('*').eq('business_id', BUSINESS_ID).order('activity_date', { ascending: false }).limit(150)
    if (rows.error) throw new Error(rows.error.message)
    return {
      ...payload,
      card: {
        ...card,
        candidates: (rows.data ?? []).map((row: any) => ({
          id: String(row.id),
          label: `${row.activity_date || ''} · ${row.summary || row.activity_type || row.id}`,
          values: row,
        })),
      },
    }
  }

  const [logs, people] = await Promise.all([
    db.from('freelancer_work_logs').select('*').eq('business_id', BUSINESS_ID).order('work_date', { ascending: false }).limit(150),
    db.from('business_people').select('id,name,person_type,status').eq('business_id', BUSINESS_ID),
  ])
  if (logs.error) throw new Error(logs.error.message)
  if (people.error) throw new Error(people.error.message)
  const names = new Map((people.data ?? []).map((row: any) => [String(row.id), String(row.name || row.id)]))
  return {
    ...payload,
    card: {
      ...card,
      candidates: (logs.data ?? []).map((row: any) => ({
        id: String(row.id),
        label: `${row.work_date || ''} · ${names.get(String(row.person_id)) || row.person_id} · ${Number(row.hours || 0)}시간`,
        values: row,
      })),
    },
  }
}

async function prepareWorkLog(request: NextRequest, session: any, body: Record<string, any>) {
  const threadId = text(body.thread_id, 80)
  const sourceUserId = text(body.source_user_message_id, 100)
  const operation = text(body.operation, 40)
  const targetId = text(body.target_id, 100)
  const fields = body.fields && typeof body.fields === 'object' ? { ...body.fields } : {}
  if (!uuidLike(threadId) || !uuidLike(sourceUserId) || !uuidLike(targetId)) throw new Error('작업시간 수정 대상을 확인할 수 없습니다.')
  if (!['UPDATE', 'DELETE'].includes(operation)) throw new Error('지원하지 않는 작업시간 변경입니다.')

  const latest = await latestUserMessage(threadId, session.loginId)
  if (!latest || text(latest.id, 100) !== sourceUserId) throw new Error('현재 대화의 최신 요청과 입력 카드가 일치하지 않습니다.')
  const intent = classifyMobileExtendedIntent(text(latest.content, 6000))
  if (!intent || intent.domain !== 'business_work_log' || intent.operation !== operation) throw new Error('현재 요청의 작업시간 업무 종류가 입력 카드와 일치하지 않습니다.')

  const db = createMoniServiceRoleClient()
  const before = await db.from('freelancer_work_logs').select('*').eq('id', targetId).eq('business_id', BUSINESS_ID).maybeSingle()
  if (before.error) throw new Error(before.error.message)
  if (!before.data) throw new Error('수정할 기존 작업시간 기록을 찾을 수 없습니다.')

  const oldPending = await db.from('moni_action_confirmations')
    .select('id,payload')
    .eq('business_id', BUSINESS_ID)
    .eq('action_domain', actionDomain('business_work_log'))
    .eq('requested_by_login_id', session.loginId)
    .eq('source_client_id', `moni-mobile:${threadId}`)
    .eq('status', 'PENDING')
    .limit(20)
  if (oldPending.error) throw new Error(oldPending.error.message)
  const staleIds = (oldPending.data ?? [])
    .filter((row: any) => text(row?.payload?.source_user_message_id, 100) === sourceUserId)
    .map((row: any) => row.id)
  if (staleIds.length) await db.from('moni_action_confirmations').update({ status: 'CANCELLED' }).in('id', staleIds).eq('status', 'PENDING')

  const confirmation = await db.from('moni_action_confirmations').insert({
    business_id: BUSINESS_ID,
    action_domain: actionDomain('business_work_log'),
    action_type: semanticAction(operation),
    target_id: targetId,
    payload: {
      domain: 'business_work_log',
      semantic_operation: operation,
      fields,
      target_id: targetId,
      source_user_message_id: sourceUserId,
    },
    before_snapshot: before.data,
    preview_text: `[작업시간 ${operation}] ${before.data.work_date || ''} · 모바일 입력카드 검토 후 PC 저장 API로 실행`,
    warnings: [],
    status: 'PENDING',
    requested_by_login_id: session.loginId,
    requested_by_role: session.role,
    source_client_id: `moni-mobile:${threadId}`,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
  }).select('id,status,preview_text,warnings,expires_at').single()
  if (confirmation.error) throw new Error(confirmation.error.message)
  return confirmation.data
}

async function executeCompatibility(request: NextRequest, session: any, threadId: string, confirmation: any) {
  const db = createMoniServiceRoleClient()
  if (confirmation.status === 'EXECUTED') return confirmation.result_snapshot || { verified: true, duplicate_safe: true }
  if (confirmation.status !== 'PENDING') throw new Error(`현재 승인 상태(${confirmation.status})에서는 실행할 수 없습니다.`)
  if (new Date(confirmation.expires_at).getTime() < Date.now()) {
    await db.from('moni_action_confirmations').update({ status: 'EXPIRED' }).eq('id', confirmation.id).eq('status', 'PENDING')
    throw new Error('승인 시간이 만료되었습니다. 입력 카드를 다시 열어 주세요.')
  }

  const claim = await db.from('moni_action_confirmations')
    .update({ status: 'EXECUTING', user_confirmation_text: '모바일 입력 카드에서 확정 실행' })
    .eq('id', confirmation.id)
    .eq('status', 'PENDING')
    .select('*')
    .maybeSingle()
  if (claim.error) throw new Error(claim.error.message)
  if (!claim.data) throw new Error('다른 요청이 먼저 실행 중이거나 이미 처리된 승인입니다.')

  const payload = claim.data.payload || {}
  const domain = text(payload.domain, 80)
  const operation = text(payload.semantic_operation, 40)
  const targetId = text(payload.target_id, 100)
  const fields = payload.fields && typeof payload.fields === 'object' ? payload.fields : {}

  try {
    let result: Record<string, any>
    if (domain === 'business_work_log') {
      const entity = 'work_logs'
      if (operation === 'DELETE') {
        result = await pcApi(request, `/api/moni/business-management?entity=${entity}&id=${encodeURIComponent(targetId)}`, 'DELETE')
      } else {
        result = await pcApi(request, '/api/moni/business-management', 'PATCH', { entity, id: targetId, data: fields })
      }
    } else if (domain === 'business_person' && operation === 'DELETE') {
      result = await pcApi(request, '/api/moni/business-management', 'PATCH', {
        entity: 'people',
        id: targetId,
        data: { ...fields, status: 'inactive' },
      })
    } else {
      throw new Error('호환 실행 대상이 아닙니다.')
    }

    const snapshot = {
      verified: true,
      verification_basis: 'PC_API_SUCCESS',
      domain,
      operation,
      target_id: targetId || null,
      result,
    }
    const done = await db.from('moni_action_confirmations')
      .update({ status: 'EXECUTED', result_snapshot: snapshot, executed_at: new Date().toISOString(), error_message: null })
      .eq('id', confirmation.id)
      .eq('status', 'EXECUTING')
    if (done.error) throw new Error(done.error.message)

    await db.from('moni_action_audit_log').insert({
      confirmation_id: confirmation.id,
      business_id: BUSINESS_ID,
      action_domain: actionDomain(domain),
      action_type: semanticAction(operation),
      target_table: domain,
      target_id: uuidLike(targetId) ? targetId : null,
      before_snapshot: claim.data.before_snapshot || null,
      after_snapshot: snapshot,
      actor_login_id: session.loginId,
      actor_role: session.role,
      source_client_id: `moni-mobile:${threadId}`,
      user_confirmation_text: '모바일 입력 카드에서 확정 실행',
    })
    return snapshot
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PC 업무 API 실행 실패'
    await db.from('moni_action_confirmations').update({ status: 'FAILED', error_message: text(message, 1800) }).eq('id', confirmation.id).eq('status', 'EXECUTING')
    throw error
  }
}

export async function GET(request: NextRequest) {
  try {
    const response = await legacyGET(request)
    const payload = await response.clone().json().catch(() => null) as Record<string, any> | null
    if (!payload || payload.ok === false) return response
    const augmented = await augmentDraft(payload)
    return NextResponse.json(augmented, { status: response.status, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'PC 입력 카드 준비 실패' }, { status: 500, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => null) as Record<string, any> | null
  if (!body) return legacyPOST(request)
  const command = text(body.command, 20).toLowerCase()
  const threadId = text(body.thread_id, 80)

  if (command === 'prepare' && body.domain === 'business_work_log' && ['UPDATE', 'DELETE'].includes(text(body.operation, 40))) {
    const auth = await requireAdmin(request)
    if (auth.response || !auth.session) return auth.response!
    try {
      const confirmation = await prepareWorkLog(request, auth.session, body)
      return NextResponse.json({ ok: true, confirmation }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '작업시간 입력 카드 준비 실패' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
  }

  if (command === 'execute' && uuidLike(body.confirmation_id) && uuidLike(threadId)) {
    const auth = await requireAdmin(request)
    if (auth.response || !auth.session) return auth.response!
    const db = createMoniServiceRoleClient()
    const confirmation = await db.from('moni_action_confirmations').select('*')
      .eq('id', text(body.confirmation_id, 80))
      .eq('business_id', BUSINESS_ID)
      .eq('requested_by_login_id', auth.session.loginId)
      .eq('source_client_id', `moni-mobile:${threadId}`)
      .maybeSingle()
    if (confirmation.error) return NextResponse.json({ ok: false, error: confirmation.error.message }, { status: 400 })
    const row = confirmation.data
    const domain = text(row?.payload?.domain, 80)
    const operation = text(row?.payload?.semantic_operation, 40)
    if (row && ((domain === 'business_work_log' && ['UPDATE', 'DELETE'].includes(operation)) || (domain === 'business_person' && operation === 'DELETE'))) {
      try {
        const result = await executeCompatibility(request, auth.session, threadId, row)
        return NextResponse.json({ ok: true, result }, { headers: { 'Cache-Control': 'no-store' } })
      } catch (error) {
        return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'PC 입력 카드 실행 실패' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
      }
    }
  }

  return legacyPOST(request)
}
