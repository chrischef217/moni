import { NextRequest, NextResponse } from 'next/server'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROFILE_ID = 'default'
const STATUSES = new Set(['DRAFT', 'REVIEW', 'APPROVED', 'ISSUED', 'SENT', 'CANCELLED'])
const TYPES = new Set(['GENERAL', 'REQUEST', 'CHANGE', 'REPLY', 'APOLOGY', 'FREE'])
const EDITABLE_STATUSES = new Set(['DRAFT', 'REVIEW', 'APPROVED'])

type JsonRecord = Record<string, unknown>

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function bool(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value
  const normalized = text(value).toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  return fallback
}

function createId(prefix: string) {
  const stamp = Date.now().toString(36).toUpperCase()
  const random = Math.floor(Math.random() * 1_000_000).toString(36).toUpperCase().padStart(4, '0')
  return `${prefix}-${stamp}-${random}`
}

async function requireAdmin(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  return session?.role === 'admin' ? session : null
}

function normalizeAttachments(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => text(item))
    .filter(Boolean)
    .slice(0, 20)
}

function validateRequired(document: any) {
  if (!text(document.recipient_company_name)) return '수신 회사를 입력해 주세요.'
  if (!text(document.title)) return '공문 제목을 입력해 주세요.'
  if (!text(document.body)) return '공문 본문을 입력해 주세요.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text(document.document_date))) return '발송일을 확인해 주세요.'
  return null
}

async function loadMetadata() {
  const supabase = createMoniServiceRoleClient()
  const [companyResult, clientResult] = await Promise.all([
    supabase.from('company_profile').select('*').eq('id', PROFILE_ID).maybeSingle(),
    supabase
      .from('sales_clients')
      .select('id, company_name, contact_name, phone, email, address, status')
      .order('company_name', { ascending: true }),
  ])

  if (companyResult.error) throw new Error(companyResult.error.message)
  if (clientResult.error) throw new Error(clientResult.error.message)

  return {
    company_profile: companyResult.data ?? null,
    clients: clientResult.data ?? [],
  }
}

async function loadDocuments(id?: string) {
  const supabase = createMoniServiceRoleClient()
  let query = supabase
    .from('official_documents')
    .select('*')
    .order('document_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (id) query = query.eq('id', id)
  const { data, error } = await query
  if (error) throw new Error(error.message || '공문 조회에 실패했습니다.')
  return data ?? []
}

async function buildEditablePayload(body: JsonRecord) {
  const documentType = text(body.document_type).toUpperCase() || 'GENERAL'
  const documentDate = text(body.document_date)
  if (!TYPES.has(documentType)) return { error: '공문 유형을 확인해 주세요.' as const }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) return { error: '발송일을 확인해 주세요.' as const }

  const supabase = createMoniServiceRoleClient()
  const { data: company, error } = await supabase.from('company_profile').select('*').eq('id', PROFILE_ID).maybeSingle()
  if (error) throw new Error(error.message)
  if (!company) return { error: '관리자에서 회사 기본정보를 먼저 등록해 주세요.' as const }

  return {
    payload: {
      document_type: documentType,
      document_date: documentDate,
      recipient_client_id: text(body.recipient_client_id) || null,
      recipient_company_name: text(body.recipient_company_name),
      recipient_contact_name: text(body.recipient_contact_name),
      recipient_address: text(body.recipient_address),
      recipient_email: text(body.recipient_email),
      recipient_phone: text(body.recipient_phone),
      title: text(body.title),
      greeting: text(body.greeting),
      reference_text: text(body.reference_text),
      body: text(body.body),
      request_summary: text(body.request_summary),
      attachment_names: normalizeAttachments(body.attachment_names),
      sender_snapshot: company,
      author_name: text(body.author_name),
      approver_name: text(body.approver_name),
      use_signature: bool(body.use_signature, true),
    },
  }
}

async function nextDocumentNo(documentDate: string) {
  const supabase = createMoniServiceRoleClient()
  const year = documentDate.slice(0, 4)
  const prefix = `DB-OUT-${year}-`
  const { data, error } = await supabase
    .from('official_documents')
    .select('document_no')
    .like('document_no', `${prefix}%`)
    .order('document_no', { ascending: false })
    .limit(1)

  if (error) throw new Error(error.message || '공문번호 생성에 실패했습니다.')
  const latest = text(data?.[0]?.document_no)
  const latestSequence = Number(latest.slice(prefix.length))
  const sequence = Number.isFinite(latestSequence) ? latestSequence + 1 : 1
  return `${prefix}${String(sequence).padStart(3, '0')}`
}

async function loadOne(id: string) {
  const documents = await loadDocuments(id)
  return documents[0] ?? null
}

export async function GET(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const id = text(request.nextUrl.searchParams.get('id'))
    const [documents, metadata] = await Promise.all([loadDocuments(id || undefined), loadMetadata()])
    if (id && !documents.length) return NextResponse.json({ ok: false, error: '공문을 찾을 수 없습니다.' }, { status: 404 })
    return NextResponse.json({ ok: true, documents, document: id ? documents[0] : null, ...metadata })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '공문 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as JsonRecord | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const action = text(body.action).toLowerCase() || 'create'
    const supabase = createMoniServiceRoleClient()

    if (action === 'copy') {
      const sourceId = text(body.id)
      const source = await loadOne(sourceId)
      if (!source) return NextResponse.json({ ok: false, error: '복사할 공문을 찾을 수 없습니다.' }, { status: 404 })

      const id = createId('OFFDOC')
      const { error } = await supabase.from('official_documents').insert({
        ...source,
        id,
        document_no: null,
        status: 'DRAFT',
        source_document_id: source.id,
        title: `${text(source.title)} (사본)`,
        issued_at: null,
        sent_at: null,
        cancelled_at: null,
        cancel_reason: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      if (error) throw new Error(error.message || '공문 복사에 실패했습니다.')
      return NextResponse.json({ ok: true, document: await loadOne(id) }, { status: 201 })
    }

    const built = await buildEditablePayload(body)
    if ('error' in built) return NextResponse.json({ ok: false, error: built.error }, { status: 400 })

    const id = createId('OFFDOC')
    const { error } = await supabase.from('official_documents').insert({
      id,
      status: 'DRAFT',
      ...built.payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    if (error) throw new Error(error.message || '공문 저장에 실패했습니다.')
    return NextResponse.json({ ok: true, document: await loadOne(id) }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '공문 저장 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const body = await request.json().catch(() => null) as JsonRecord | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const id = text(body.id)
    const action = text(body.action).toLowerCase() || 'save'
    if (!id) return NextResponse.json({ ok: false, error: '공문 ID가 필요합니다.' }, { status: 400 })

    const current = await loadOne(id)
    if (!current) return NextResponse.json({ ok: false, error: '공문을 찾을 수 없습니다.' }, { status: 404 })
    const currentStatus = text(current.status).toUpperCase()
    if (!STATUSES.has(currentStatus)) return NextResponse.json({ ok: false, error: '공문 상태가 올바르지 않습니다.' }, { status: 409 })

    const supabase = createMoniServiceRoleClient()

    if (action === 'save') {
      if (!EDITABLE_STATUSES.has(currentStatus)) return NextResponse.json({ ok: false, error: '발행 완료된 공문은 수정할 수 없습니다. 복사 후 새 공문으로 작성해 주세요.' }, { status: 409 })
      const built = await buildEditablePayload(body)
      if ('error' in built) return NextResponse.json({ ok: false, error: built.error }, { status: 400 })
      const { error } = await supabase.from('official_documents').update(built.payload).eq('id', id)
      if (error) throw new Error(error.message || '공문 수정에 실패했습니다.')
    } else if (action === 'submit_review') {
      if (currentStatus !== 'DRAFT') return NextResponse.json({ ok: false, error: '작성 중 공문만 검토 요청할 수 있습니다.' }, { status: 409 })
      const requiredError = validateRequired(current)
      if (requiredError) return NextResponse.json({ ok: false, error: requiredError }, { status: 400 })
      const { error } = await supabase.from('official_documents').update({ status: 'REVIEW' }).eq('id', id)
      if (error) throw new Error(error.message)
    } else if (action === 'approve') {
      if (currentStatus !== 'REVIEW') return NextResponse.json({ ok: false, error: '검토 대기 공문만 승인할 수 있습니다.' }, { status: 409 })
      const { error } = await supabase.from('official_documents').update({ status: 'APPROVED' }).eq('id', id)
      if (error) throw new Error(error.message)
    } else if (action === 'issue') {
      if (currentStatus !== 'APPROVED') return NextResponse.json({ ok: false, error: '승인 완료된 공문만 발행할 수 있습니다.' }, { status: 409 })
      const requiredError = validateRequired(current)
      if (requiredError) return NextResponse.json({ ok: false, error: requiredError }, { status: 400 })

      let issued = false
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const documentNo = await nextDocumentNo(text(current.document_date))
        const { error } = await supabase.from('official_documents').update({
          document_no: documentNo,
          status: 'ISSUED',
          issued_at: new Date().toISOString(),
        }).eq('id', id).is('document_no', null)
        if (!error) {
          issued = true
          break
        }
        if (error.code !== '23505') throw new Error(error.message)
      }
      if (!issued) return NextResponse.json({ ok: false, error: '공문번호 생성 충돌이 발생했습니다. 다시 시도해 주세요.' }, { status: 409 })
    } else if (action === 'mark_sent') {
      if (currentStatus !== 'ISSUED') return NextResponse.json({ ok: false, error: '발행 완료 공문만 발송 완료 처리할 수 있습니다.' }, { status: 409 })
      const { error } = await supabase.from('official_documents').update({ status: 'SENT', sent_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(error.message)
    } else if (action === 'cancel') {
      if (!['ISSUED', 'SENT'].includes(currentStatus)) return NextResponse.json({ ok: false, error: '발행 또는 발송 완료 공문만 취소할 수 있습니다.' }, { status: 409 })
      const reason = text(body.cancel_reason)
      if (!reason) return NextResponse.json({ ok: false, error: '취소 사유를 입력해 주세요.' }, { status: 400 })
      const { error } = await supabase.from('official_documents').update({
        status: 'CANCELLED',
        cancel_reason: reason,
        cancelled_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw new Error(error.message)
    } else {
      return NextResponse.json({ ok: false, error: '지원하지 않는 작업입니다.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, document: await loadOne(id) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '공문 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await requireAdmin(request))) return NextResponse.json({ ok: false, error: '관리자 권한이 필요합니다.' }, { status: 403 })
    const id = text(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ ok: false, error: '공문 ID가 필요합니다.' }, { status: 400 })
    const current = await loadOne(id)
    if (!current) return NextResponse.json({ ok: false, error: '공문을 찾을 수 없습니다.' }, { status: 404 })
    if (text(current.status).toUpperCase() !== 'DRAFT') return NextResponse.json({ ok: false, error: '작성 중 공문만 삭제할 수 있습니다.' }, { status: 409 })

    const supabase = createMoniServiceRoleClient()
    const { error } = await supabase.from('official_documents').delete().eq('id', id)
    if (error) throw new Error(error.message || '공문 삭제에 실패했습니다.')
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '공문 삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
