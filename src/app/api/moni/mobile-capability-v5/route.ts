import { NextRequest, NextResponse } from 'next/server'
import { GET as legacyGET, POST as legacyPOST } from '../mobile-capability-v4/route'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const ATTACHMENT_BUCKET = 'moni-ai-attachments'
const text = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max)
const num = (value: unknown) => { const parsed = Number(String(value ?? '').replace(/,/g, '')); return Number.isFinite(parsed) ? parsed : 0 }
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))
const monthNow = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
const noStore = { 'Cache-Control': 'no-store' }

type Json = Record<string, any>
type Db = ReturnType<typeof createMoniServiceRoleClient>

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: noStore })
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) return { session: null, response: json({ ok: false, error: '로그인이 필요합니다.' }, 401) }
  if (session.role !== 'admin') return { session: null, response: json({ ok: false, error: '관리자만 이 업무를 실행할 수 있습니다.' }, 403) }
  return { session, response: null }
}

async function pcJson(request: NextRequest, pathname: string) {
  const url = new URL(pathname, request.url)
  const headers: Record<string, string> = {}
  const cookie = request.headers.get('cookie')
  if (cookie) headers.cookie = cookie
  const response = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
  const payload = await response.json().catch(() => ({})) as Json
  if (!response.ok || payload.ok === false) throw new Error(text(payload.error, 1800) || `${pathname} 조회 실패 (${response.status})`)
  return payload
}

async function executeSalesCommissionOnly(request: NextRequest, body: Json) {
  const auth = await requireAdmin(request)
  if (auth.response || !auth.session) return auth.response!
  const threadId = text(body.thread_id, 80)
  const confirmationId = text(body.confirmation_id, 80)
  if (!uuidLike(threadId) || !uuidLike(confirmationId)) return json({ ok: false, error: '승인 정보를 확인할 수 없습니다.' }, 400)

  const db = createMoniServiceRoleClient()
  const confirmation = await db.from('moni_action_confirmations').select('*')
    .eq('id', confirmationId)
    .eq('business_id', BUSINESS_ID)
    .eq('requested_by_login_id', auth.session.loginId)
    .eq('source_client_id', `moni-mobile:${threadId}`)
    .maybeSingle()
  if (confirmation.error) return json({ ok: false, error: confirmation.error.message }, 400)
  const row: any = confirmation.data
  if (!row || text(row.action_domain) !== 'mobile_capability_v4_sales_commission_settlement') return null
  if (row.status === 'EXECUTED') return json({ ok: true, result: row.result_snapshot || { verified: true, duplicate_safe: true } })
  if (row.status !== 'PENDING') return json({ ok: false, error: `현재 승인 상태(${row.status})에서는 실행할 수 없습니다.` }, 400)
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db.from('moni_action_confirmations').update({ status: 'EXPIRED' }).eq('id', row.id).eq('status', 'PENDING')
    return json({ ok: false, error: '승인 시간이 만료되었습니다. 입력 카드를 다시 열어 주세요.' }, 400)
  }

  const claim = await db.from('moni_action_confirmations').update({ status: 'EXECUTING', user_confirmation_text: '모바일 입력 카드에서 확정 실행' }).eq('id', row.id).eq('status', 'PENDING').select('*').maybeSingle()
  if (claim.error) return json({ ok: false, error: claim.error.message }, 400)
  if (!claim.data) return json({ ok: false, error: '다른 요청이 먼저 실행 중이거나 이미 처리된 승인입니다.' }, 409)

  try {
    const fields = claim.data.payload?.fields || {}
    const month = /^\d{4}-\d{2}$/.test(text(fields.month, 7)) ? text(fields.month, 7) : monthNow()
    const state = await pcJson(request, `/api/moni/business-management?month=${encodeURIComponent(month)}`)
    const rows = (Array.isArray(state.settlement_preview) ? state.settlement_preview : [])
      .filter((item: any) => text(item.source_type) === 'sales' && num(item.gross_amount) > 0)

    const settlementMonth = `${month}-01`
    const upsertRows = rows.map((item: any) => ({
      business_id: BUSINESS_ID,
      person_id: item.person_id,
      settlement_month: settlementMonth,
      source_type: 'sales',
      gross_amount: num(item.gross_amount),
      withholding_rate: num(item.withholding_rate),
      withholding_amount: num(item.withholding_amount),
      net_amount: num(item.net_amount),
      status: text(item.saved?.status, 40) || 'draft',
      detail_json: item.detail && typeof item.detail === 'object' ? item.detail : {},
      memo: text(item.saved?.memo, 1000) || null,
      updated_at: new Date().toISOString(),
    }))

    let saved: any[] = []
    if (upsertRows.length) {
      const result = await db.from('freelancer_settlements').upsert(upsertRows, { onConflict: 'business_id,person_id,settlement_month,source_type' }).select('*')
      if (result.error) throw new Error(result.error.message)
      saved = result.data ?? []
    }

    const snapshot = {
      verified: true,
      verification_basis: 'CANONICAL_PC_SETTLEMENT_ENGINE_SALES_ONLY',
      domain: 'sales_commission_settlement',
      operation: 'CREATE',
      target_id: null,
      result: { saved: saved.length, month, settlements: saved },
    }
    const done = await db.from('moni_action_confirmations').update({ status: 'EXECUTED', result_snapshot: snapshot, executed_at: new Date().toISOString(), error_message: null }).eq('id', row.id).eq('status', 'EXECUTING')
    if (done.error) throw new Error(done.error.message)
    await db.from('moni_action_audit_log').insert({
      confirmation_id: row.id,
      business_id: BUSINESS_ID,
      action_domain: 'mobile_capability_v4_sales_commission_settlement',
      action_type: claim.data.action_type || 'CREATE',
      target_table: 'freelancer_settlements',
      target_id: null,
      before_snapshot: claim.data.before_snapshot || null,
      after_snapshot: snapshot,
      actor_login_id: auth.session.loginId,
      actor_role: auth.session.role,
      source_client_id: `moni-mobile:${threadId}`,
      user_confirmation_text: '모바일 입력 카드에서 확정 실행',
    })
    return json({ ok: true, result: snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : '영업 수당 정산 저장에 실패했습니다.'
    await db.from('moni_action_confirmations').update({ status: 'FAILED', error_message: text(message, 1800) }).eq('id', row.id).eq('status', 'EXECUTING')
    return json({ ok: false, error: message }, 400)
  }
}

async function appendHistoricalHrLinks(payload: Json) {
  const db = createMoniServiceRoleClient()
  const [docsResult, peopleResult] = await Promise.all([
    db.from('moni_hr_required_documents').select('id,person_id,document_type,attachment_id,status,expires_on').eq('business_id', BUSINESS_ID).neq('status', 'deleted').order('created_at', { ascending: false }).limit(100),
    db.from('business_people').select('id,name').eq('business_id', BUSINESS_ID),
  ])
  if (docsResult.error) throw new Error(docsResult.error.message)
  if (peopleResult.error) throw new Error(peopleResult.error.message)
  const docs = docsResult.data ?? []
  const ids = Array.from(new Set(docs.map((row: any) => text(row.attachment_id, 80)).filter(uuidLike)))
  if (!ids.length) return payload
  const attachments = await db.from('moni_ai_attachments').select('id,file_name,storage_path,upload_status').eq('business_id', BUSINESS_ID).eq('upload_status', 'READY').in('id', ids)
  if (attachments.error) throw new Error(attachments.error.message)
  const byAttachment = new Map((attachments.data ?? []).map((row: any) => [row.id, row]))
  const names = new Map((peopleResult.data ?? []).map((row: any) => [row.id, row.name]))
  const links: Array<{ label: string; href: string }> = []
  for (const doc of docs.slice(0, 20)) {
    const attachment: any = byAttachment.get(doc.attachment_id)
    if (!attachment) continue
    const signed = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(attachment.storage_path, 600)
    if (signed.data?.signedUrl) links.push({ label: `${names.get(doc.person_id) || '인력'} · ${doc.document_type} · ${attachment.file_name}`, href: signed.data.signedUrl })
    if (links.length >= 10) break
  }
  if (payload.result && typeof payload.result === 'object') payload.result.links = links
  return payload
}

async function appendQuoteLinks(payload: Json) {
  const db = createMoniServiceRoleClient()
  const quotes = await db.from('moni_quotes').select('id,quote_number,client_name,quote_date,status').eq('business_id', BUSINESS_ID).order('quote_date', { ascending: false }).order('created_at', { ascending: false }).limit(10)
  if (quotes.error) throw new Error(quotes.error.message)
  if (payload.result && typeof payload.result === 'object') {
    payload.result.links = (quotes.data ?? []).map((row: any) => ({ label: `${row.quote_number} · ${row.client_name}`, href: `/api/moni/mobile-quote-print?id=${encodeURIComponent(row.id)}` }))
  }
  return payload
}

async function recomputeHrReadyFlag(payload: Json, confirmationId: string) {
  const snapshot = payload.result
  if (!snapshot || snapshot.domain !== 'hr_required_document' || snapshot.operation !== 'DELETE') return payload
  const doc = snapshot.result
  const personId = text(doc?.person_id, 80)
  const documentType = text(doc?.document_type, 80)
  const readyField = documentType === 'contract' ? 'contract_document_ready' : documentType === 'id' ? 'id_document_ready' : documentType === 'bank' ? 'bank_document_ready' : ''
  if (!uuidLike(personId) || !readyField) return payload

  const db = createMoniServiceRoleClient()
  const remaining = await db.from('moni_hr_required_documents').select('id').eq('business_id', BUSINESS_ID).eq('person_id', personId).eq('document_type', documentType).eq('status', 'active').limit(1)
  if (remaining.error) throw new Error(remaining.error.message)
  const isReady = (remaining.data ?? []).length > 0
  const person = await db.from('business_people').update({ [readyField]: isReady, updated_at: new Date().toISOString() }).eq('id', personId).eq('business_id', BUSINESS_ID)
  if (person.error) throw new Error(person.error.message)
  const nextSnapshot = { ...snapshot, result: { ...doc, ready_flag: readyField, ready_value: isReady } }
  await db.from('moni_action_confirmations').update({ result_snapshot: nextSnapshot }).eq('id', confirmationId).eq('status', 'EXECUTED')
  payload.result = nextSnapshot
  return payload
}

function decorateQuoteExecution(payload: Json) {
  const snapshot = payload.result
  if (!snapshot || snapshot.domain !== 'quote_management' || !['CREATE','UPDATE'].includes(text(snapshot.operation, 20))) return payload
  const quote = snapshot.result
  if (!uuidLike(quote?.id)) return payload
  payload.result = {
    ...snapshot,
    result: {
      title: '견적서 저장 완료',
      lines: [`견적번호 ${text(quote.quote_number)}`, `${text(quote.client_name)} · ${text(quote.quote_date)}`, `합계 ${Math.round(num(quote.total_amount)).toLocaleString('ko-KR')}${text(quote.currency) === 'USD' ? ' USD' : '원'}`],
      links: [{ label: '견적서 인쇄/PDF', href: `/api/moni/mobile-quote-print?id=${encodeURIComponent(quote.id)}` }],
    },
  }
  return payload
}

export async function GET(request: NextRequest) {
  const response = await legacyGET(request)
  const payload = await response.json().catch(() => null) as Json | null
  if (!payload) return json({ ok: false, error: 'V4 카드 응답을 확인할 수 없습니다.' }, 500)
  if (response.ok && payload.ok && payload.card?.domain === 'quote_management' && Array.isArray(payload.card.schema)) {
    payload.card.schema = payload.card.schema.map((item: any) => item.key === 'client_name' ? { ...item, required: false } : item)
  }
  if (response.ok && payload.ok && payload.card?.domain === 'financial_audit' && Array.isArray(payload.card.schema)) {
    payload.card.schema = payload.card.schema.map((item: any) => item.key === 'attachment_id' && Array.isArray(item.options) ? { ...item, value: item.options[0]?.value || '' } : item)
  }
  return json(payload, response.status)
}

export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => null) as Json | null
  if (!body) return json({ ok: false, error: '요청 본문이 필요합니다.' }, 400)

  if (text(body.command, 30) === 'execute') {
    const scoped = await executeSalesCommissionOnly(request, body)
    if (scoped) return scoped
  }

  const response = await legacyPOST(request)
  let payload = await response.json().catch(() => null) as Json | null
  if (!payload) return json({ ok: false, error: 'V4 업무 응답을 확인할 수 없습니다.' }, 500)
  if (!response.ok || payload.ok === false) return json(payload, response.status)

  try {
    if (text(body.command, 30) === 'read' && body.domain === 'hr_required_document') payload = await appendHistoricalHrLinks(payload)
    if (text(body.command, 30) === 'read' && body.domain === 'quote_management') payload = await appendQuoteLinks(payload)
    if (text(body.command, 30) === 'execute' && uuidLike(body.confirmation_id)) payload = await recomputeHrReadyFlag(payload, text(body.confirmation_id, 80))
    if (text(body.command, 30) === 'execute') payload = decorateQuoteExecution(payload)
    return json(payload, response.status)
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'V5 후처리 중 오류가 발생했습니다.' }, 500)
  }
}
