import { NextRequest, NextResponse } from 'next/server'
import { GET as v5GET, POST as v5POST } from '../mobile-capability-v5/route'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { classifyMobileCapabilityV4Intent } from '@/lib/moni/mobile-capability-v4-intents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const ATTACHMENT_BUCKET = 'moni-ai-attachments'
const text = (value: unknown, max = 2000) => String(value ?? '').trim().slice(0, max)
const uuidLike = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value, 80))

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function readHrRequiredDocuments(request: NextRequest, body: Record<string, any>) {
  const session = await getSessionFromRequest(request)
  if (!session) return json({ ok: false, error: '로그인이 필요합니다.' }, 401)
  if (session.role !== 'admin') return json({ ok: false, error: '관리자만 이 업무를 조회할 수 있습니다.' }, 403)

  const threadId = text(body.thread_id, 80)
  const sourceId = text(body.source_user_message_id, 80)
  if (!uuidLike(threadId) || !uuidLike(sourceId)) return json({ ok: false, error: '현재 대화의 조회 요청을 확인할 수 없습니다.' }, 400)

  const db = createMoniServiceRoleClient()
  const thread = await db.from('moni_ai_threads').select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', session.loginId).eq('status', 'ACTIVE').maybeSingle()
  if (thread.error) return json({ ok: false, error: thread.error.message }, 400)
  if (!thread.data) return json({ ok: false, error: '현재 대화방을 확인할 수 없습니다.' }, 404)

  const latest = await db.from('moni_ai_messages').select('id,content').eq('business_id', BUSINESS_ID).eq('thread_id', threadId).eq('role', 'user').order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (latest.error) return json({ ok: false, error: latest.error.message }, 400)
  if (!latest.data || text(latest.data.id, 80) !== sourceId) return json({ ok: false, error: '현재 대화의 최신 요청과 조회 카드가 일치하지 않습니다.' }, 409)
  const intent = classifyMobileCapabilityV4Intent(latest.data.content)
  if (!intent || intent.domain !== 'hr_required_document' || intent.operation !== 'READ') return json({ ok: false, error: '현재 요청은 필수서류 조회가 아닙니다.' }, 400)

  const [docsResult, peopleResult] = await Promise.all([
    db.from('moni_hr_required_documents').select('id,person_id,document_type,attachment_id,status,expires_on,note,created_at').eq('business_id', BUSINESS_ID).neq('status', 'deleted').order('created_at', { ascending: false }).limit(100),
    db.from('business_people').select('id,name').eq('business_id', BUSINESS_ID),
  ])
  if (docsResult.error) return json({ ok: false, error: docsResult.error.message }, 400)
  if (peopleResult.error) return json({ ok: false, error: peopleResult.error.message }, 400)

  const docs = docsResult.data ?? []
  const attachmentIds = Array.from(new Set(docs.map((row: any) => text(row.attachment_id, 80)).filter(uuidLike)))
  const attachmentResult = attachmentIds.length
    ? await db.from('moni_ai_attachments').select('id,file_name,storage_path').eq('business_id', BUSINESS_ID).eq('upload_status', 'READY').in('id', attachmentIds)
    : { data: [], error: null }
  if (attachmentResult.error) return json({ ok: false, error: attachmentResult.error.message }, 400)

  const names = new Map((peopleResult.data ?? []).map((row: any) => [row.id, row.name]))
  const attachments = new Map((attachmentResult.data ?? []).map((row: any) => [row.id, row]))
  const links: Array<{ label: string; href: string }> = []
  for (const doc of docs.slice(0, 20)) {
    const attachment: any = attachments.get(doc.attachment_id)
    if (!attachment) continue
    const signed = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(attachment.storage_path, 600)
    if (signed.data?.signedUrl) links.push({ label: `${names.get(doc.person_id) || '인력'} · ${doc.document_type} · ${attachment.file_name}`, href: signed.data.signedUrl })
    if (links.length >= 10) break
  }

  return json({
    ok: true,
    result: {
      title: '필수서류 관리',
      lines: [
        `등록 서류 ${docs.length}건`,
        ...docs.slice(0, 15).map((row: any) => `${names.get(row.person_id) || '인력'} · ${row.document_type} · ${row.status}${row.expires_on ? ` · 만료 ${row.expires_on}` : ''}`),
      ],
      links,
    },
  })
}

export async function GET(request: NextRequest) {
  return v5GET(request)
}

export async function POST(request: NextRequest) {
  const body = await request.clone().json().catch(() => null) as Record<string, any> | null
  if (body && text(body.command, 30) === 'read' && body.domain === 'hr_required_document') {
    return readHrRequiredDocuments(request, body)
  }
  return v5POST(request)
}
