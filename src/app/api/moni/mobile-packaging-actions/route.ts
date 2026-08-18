import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileBusinessIntent } from '@/lib/moni/mobile-business-intents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const BUSINESS_ID = '20220523011'
const PACKAGING_BUSINESS_IDS = [BUSINESS_ID, 'default']
const text = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => { const parsed = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : 0 }
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()) }

async function auth(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 }) }
  if (session.role !== 'admin') return { session: null, response: NextResponse.json({ ok: false, error: '관리자만 업무값을 변경할 수 있습니다.' }, { status: 403 }) }
  return { session, response: null }
}

async function latestUser(threadId: string, loginId: string) {
  const db = createMoniServiceRoleClient()
  const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', loginId).eq('status', 'ACTIVE').maybeSingle()
  if (thread.error || !thread.data) throw new Error('현재 MONI 대화방을 확인할 수 없습니다.')
  const message = await db.from('moni_ai_messages').select('id,content').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('role', 'user').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (message.error) throw new Error(message.error.message)
  return message.data
}

async function materials() {
  const db = createMoniServiceRoleClient()
  const result = await db.from('packaging_materials').select('id,material_code,material_name,business_id,is_active,supplier,current_stock,unit_price,spec,material_type,ingredient_type').in('business_id', PACKAGING_BUSINESS_IDS).eq('is_active', true).order('material_name')
  if (result.error) throw new Error(result.error.message)
  return result.data ?? []
}

export async function GET(request: NextRequest) {
  const access = await auth(request)
  if (access.response || !access.session) return access.response!
  const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
  if (!uuidLike(threadId)) return NextResponse.json({ ok: false, error: '유효한 thread_id가 필요합니다.' }, { status: 400 })
  try {
    const user = await latestUser(threadId, access.session.loginId)
    if (!user) return NextResponse.json({ ok: true, card: null })
    const intent = classifyMobileBusinessIntent(user.content)
    if (!intent || intent.domain !== 'packaging_inbound') return NextResponse.json({ ok: true, card: null }, { headers: { 'Cache-Control': 'no-store' } })
    const db = createMoniServiceRoleClient()
    const existing = await db.from('moni_action_confirmations').select('*').eq('business_id', BUSINESS_ID).eq('action_domain', 'mobile_packaging_inbound').eq('requested_by_login_id', access.session.loginId).eq('source_client_id', `moni-mobile:${threadId}`).order('created_at', { ascending: false }).limit(10)
    if (existing.error) throw new Error(existing.error.message)
    const confirmation = (existing.data ?? []).find((row: any) => text(row?.payload?.source_user_message_id, 100) === text(user.id, 100))
    if (confirmation) {
      const stage = confirmation.status === 'PENDING' ? 'confirmation' : confirmation.status === 'EXECUTED' ? 'completed' : confirmation.status === 'FAILED' ? 'failed' : null
      if (stage) return NextResponse.json({ ok: true, card: { stage, domain: 'packaging_inbound', operation: intent.operation, source_user_message_id: user.id, confirmation_id: confirmation.id, preview_text: confirmation.preview_text, warnings: confirmation.warnings || [], result: confirmation.result_snapshot, error: confirmation.error_message } }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const allMaterials = await materials()
    const tx = await db.from('packaging_transactions').select('id,material_code,txn_type,quantity,txn_date,counterparty,note,created_at,business_id').in('business_id', PACKAGING_BUSINESS_IDS).order('txn_date', { ascending: false }).order('created_at', { ascending: false }).limit(60)
    if (tx.error) throw new Error(tx.error.message)
    const meta = new Map(allMaterials.flatMap((row: any) => [[text(row.id), row], [text(row.material_code), row]]))
    const candidates = (tx.data ?? []).filter((row: any) => text(row.txn_type).toUpperCase().includes('INBOUND')).map((row: any) => ({ ...row, material_name: text(meta.get(text(row.material_code))?.material_name) || text(row.material_code) }))
    return NextResponse.json({ ok: true, card: { stage: 'draft', domain: 'packaging_inbound', operation: intent.operation, source_user_message_id: user.id, fields: { tx_date: today(), quantity: '', counterparty: '', note: '' }, candidates, options: { packaging_materials: allMaterials, products: [], clients: [], variants: [], terms: [], suppliers: [], raw_materials: [] } } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '부재료 업무 카드를 준비하지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const access = await auth(request)
  if (access.response || !access.session) return access.response!
  try {
    const body = await request.json().catch(() => null) as Record<string, any> | null
    if (!body || text(body.command) !== 'prepare') return NextResponse.json({ ok: false, error: '부재료 준비 요청만 지원합니다.' }, { status: 400 })
    const threadId = text(body.thread_id, 80)
    const sourceUserId = text(body.source_user_message_id, 100)
    const operation = text(body.operation, 30)
    const fields = body.fields || {}
    const targetId = text(body.target_id, 100)
    if (!uuidLike(threadId) || !sourceUserId) throw new Error('대화/원본 요청을 확인할 수 없습니다.')
    const allMaterials = await materials()
    const material = allMaterials.find((row: any) => text(row.id) === text(fields.material_code) || text(row.material_code) === text(fields.material_code))
    if (operation !== 'DELETE' && !material) throw new Error('부재료를 전체 목록에서 선택해 주세요.')
    if (operation !== 'DELETE' && num(fields.quantity) <= 0) throw new Error('입고수량은 0보다 커야 합니다.')
    const db = createMoniServiceRoleClient()
    let before: any = null
    if (operation !== 'CREATE') {
      const result = await db.from('packaging_transactions').select('*').eq('id', targetId).in('business_id', PACKAGING_BUSINESS_IDS).maybeSingle()
      if (result.error || !result.data) throw new Error('수정·삭제할 부재료 입고 기록을 찾을 수 없습니다.')
      if (!text(result.data.txn_type).toUpperCase().includes('INBOUND')) throw new Error('자동 출고 내역은 수정·삭제할 수 없습니다.')
      before = result.data
    }
    const payload = { ...fields, target_id: targetId || undefined, material_name: text(material?.material_name) || text(before?.material_code), source_user_message_id: sourceUserId }
    const preview = operation === 'CREATE' ? `[부재료 입고] ${fields.tx_date} / ${payload.material_name} / ${fields.quantity}EA / ${fields.counterparty || '매입처 미입력'}` : operation === 'UPDATE' ? `[부재료 입고 수정] ${before?.txn_date || ''} ${payload.material_name} ${before?.quantity || 0}EA → ${fields.tx_date} ${fields.quantity}EA` : `[부재료 입고 삭제] ${before?.txn_date || ''} / ${payload.material_name} / ${before?.quantity || 0}EA`
    const insert = await db.from('moni_action_confirmations').insert({ business_id: BUSINESS_ID, action_domain: 'mobile_packaging_inbound', action_type: operation, target_id: targetId || null, payload, before_snapshot: before, preview_text: preview, warnings: ['부재료 마스터는 기존 PC 호환을 위해 legacy default 영역을 사용하며, 이 예외는 부재료 영역에만 적용됩니다.'], status: 'PENDING', requested_by_login_id: access.session.loginId, requested_by_role: access.session.role, source_client_id: `moni-mobile:${threadId}`, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() }).select('id,status,expires_at,preview_text,warnings').single()
    if (insert.error) throw new Error(insert.error.message)
    return NextResponse.json({ ok: true, confirmation: insert.data })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '부재료 입력을 확인하지 못했습니다.' }, { status: 500 })
  }
}
