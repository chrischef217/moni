import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { executeProductionPlanChange } from '@/lib/moni/chatgpt-write-actions'
import { executeProductionOperation } from '@/lib/moni/chatgpt-production-actions'
import type { MoniMcpIdentity } from '@/lib/moni/mcp/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const BUSINESS_ID = '20220523011'
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))

async function internalJson(request: NextRequest, path: string, init: RequestInit) {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const cookie = request.headers.get('cookie')
  if (cookie) headers.set('cookie', cookie)
  const response = await fetch(new URL(path, request.url), { ...init, headers, cache: 'no-store' })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || !payload.ok) throw new Error(payload.error || `업무 실행 실패 (${response.status})`)
  return payload
}

function identity(session: { loginId: string; displayName: string; role: string }, threadId: string): MoniMcpIdentity {
  return { tokenId: 'moni-mobile', clientId: `moni-mobile:${threadId}`, loginId: session.loginId, displayName: session.displayName, role: session.role, scopes: ['moni:read', 'moni:write'] }
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 })
  try {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) throw new Error('요청 본문이 필요합니다.')
    const threadId = text(body.thread_id, 80)
    const confirmationId = text(body.confirmation_id, 80)
    if (!uuidLike(threadId) || !uuidLike(confirmationId)) throw new Error('대화/승인 정보를 확인할 수 없습니다.')
    const db = createMoniServiceRoleClient()
    const result = await db.from('moni_action_confirmations').select('*').eq('id', confirmationId).eq('business_id', BUSINESS_ID).eq('requested_by_login_id', session.loginId).eq('source_client_id', `moni-mobile:${threadId}`).maybeSingle()
    if (result.error || !result.data) throw new Error('승인 건을 찾을 수 없습니다.')
    const confirmation = result.data as any
    if (confirmation.status !== 'PENDING') throw new Error('이미 처리 중이거나 완료된 승인 건입니다. 중복 실행하지 않습니다.')
    if (new Date(confirmation.expires_at).getTime() <= Date.now()) throw new Error('승인 시간이 만료되었습니다. 입력 내용을 다시 확인해 주세요.')
    const who = identity(session, threadId)

    if (confirmation.action_domain === 'production_plan') {
      const executed = await executeProductionPlanChange({ confirmation_id: confirmationId, user_confirmation_text: '모바일 업무 카드 최종 확정' }, who)
      return NextResponse.json({ ok: true, result: executed })
    }
    if (confirmation.action_domain === 'production_record') {
      const executed = await executeProductionOperation({ confirmation_id: confirmationId, user_confirmation_text: '모바일 업무 카드 최종 확정' }, who)
      return NextResponse.json({ ok: true, result: executed })
    }

    const domain = text(confirmation.action_domain).replace(/^mobile_/, '')
    const operation = text(confirmation.action_type)
    const payload = confirmation.payload || {}
    const lock = await db.from('moni_action_confirmations').update({ status: 'EXECUTING' }).eq('id', confirmationId).eq('status', 'PENDING').select('id').maybeSingle()
    if (lock.error) throw new Error(lock.error.message)
    if (!lock.data) throw new Error('다른 실행이 이미 이 승인 건을 처리 중입니다. 중복 실행하지 않습니다.')

    try {
      let executed: any
      if (domain === 'packaging_inbound') {
        if (operation === 'CREATE') executed = await internalJson(request, '/api/moni/packaging-transactions', { method: 'POST', body: JSON.stringify({ material_code: payload.material_code, quantity: payload.quantity, tx_date: payload.tx_date, counterparty: payload.counterparty, note: payload.note }) })
        else if (operation === 'UPDATE') executed = await internalJson(request, '/api/moni/packaging-transactions', { method: 'PATCH', body: JSON.stringify({ id: payload.target_id, quantity: payload.quantity, tx_date: payload.tx_date, counterparty: payload.counterparty, note: payload.note }) })
        else executed = await internalJson(request, `/api/moni/packaging-transactions?id=${encodeURIComponent(payload.target_id)}`, { method: 'DELETE' })
      } else if (domain === 'sales_order') {
        executed = operation === 'CANCEL'
          ? await internalJson(request, '/api/moni/sales-orders-v4', { method: 'POST', body: JSON.stringify({ action: 'cancel_order', id: payload.target_id, data: { reason: payload.reason || '모바일 MONI에서 취소' } }) })
          : await internalJson(request, '/api/moni/sales-orders-v4', { method: 'POST', body: JSON.stringify({ action: 'save_order', id: operation === 'UPDATE' ? payload.target_id : '', data: payload }) })
      } else if (domain === 'purchase') {
        executed = operation === 'CANCEL'
          ? await internalJson(request, '/api/moni/purchases', { method: 'POST', body: JSON.stringify({ action: 'cancel_purchase', id: payload.target_id }) })
          : await internalJson(request, '/api/moni/purchases', { method: 'POST', body: JSON.stringify({ action: 'create_purchase', ...payload }) })
      } else if (domain === 'payment') {
        executed = await internalJson(request, '/api/moni/purchases', { method: 'POST', body: JSON.stringify({ action: 'add_payment', ...payload }) })
      } else {
        throw new Error('허용되지 않은 모바일 실행 영역입니다.')
      }
      const complete = await db.from('moni_action_confirmations').update({ status: 'EXECUTED', result_snapshot: executed, executed_at: new Date().toISOString() }).eq('id', confirmationId).eq('status', 'EXECUTING')
      if (complete.error) throw new Error(complete.error.message)
      return NextResponse.json({ ok: true, result: executed })
    } catch (error) {
      await db.from('moni_action_confirmations').update({ status: 'FAILED', error_message: error instanceof Error ? error.message : '실행 실패' }).eq('id', confirmationId).eq('status', 'EXECUTING')
      throw error
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '모바일 업무를 실행하지 못했습니다.' }, { status: 500 })
  }
}
