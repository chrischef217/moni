import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = '20220523011'
const BUCKET = 'moni-ai-attachments'
const MAX_FILE_SIZE = 25 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

type Json = Record<string, unknown>

type PageContext = {
  pathname?: string
  search?: string
  title?: string
  headings?: string[]
}

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max)
const numberValue = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function cleanPage(raw: PageContext | undefined) {
  return {
    pathname: text(raw?.pathname, 300),
    search: text(raw?.search, 500),
    title: text(raw?.title, 160),
    headings: Array.isArray(raw?.headings)
      ? raw!.headings!.map((item) => text(item, 120)).filter(Boolean).slice(0, 6)
      : [],
  }
}

function safeFileName(value: string) {
  const normalized = value.normalize('NFKC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim()
  return (normalized || 'attachment').slice(-140)
}

async function ensureThread(
  supabase: ReturnType<typeof createMoniServiceRoleClient>,
  session: NonNullable<Awaited<ReturnType<typeof getSessionFromRequest>>>,
  threadId: string,
  page: ReturnType<typeof cleanPage>,
) {
  if (threadId) {
    const { data, error } = await supabase
      .from('moni_ai_threads')
      .select('*')
      .eq('id', threadId)
      .eq('business_id', BUSINESS_ID)
      .eq('user_login_id', session.loginId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error('MONI AI 대화방을 확인할 수 없습니다.')
    await supabase
      .from('moni_ai_threads')
      .update({ current_page: page, updated_at: new Date().toISOString() })
      .eq('id', threadId)
    return data
  }

  const { data, error } = await supabase
    .from('moni_ai_threads')
    .insert({
      business_id: BUSINESS_ID,
      user_login_id: session.loginId,
      user_display_name: session.displayName,
      user_role: session.role,
      current_page: page,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })

    const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
    if (!threadId) return NextResponse.json({ ok: false, error: '대화방 ID가 필요합니다.' }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { data: thread, error: threadError } = await supabase
      .from('moni_ai_threads')
      .select('id')
      .eq('id', threadId)
      .eq('business_id', BUSINESS_ID)
      .eq('user_login_id', session.loginId)
      .maybeSingle()
    if (threadError) throw new Error(threadError.message)
    if (!thread) return NextResponse.json({ ok: false, error: '대화방을 찾을 수 없습니다.' }, { status: 404 })

    const { data, error } = await supabase
      .from('moni_ai_attachments')
      .select('*')
      .eq('thread_id', threadId)
      .eq('upload_status', 'READY')
      .order('created_at')
    if (error) throw new Error(error.message)

    const attachments = await Promise.all((data ?? []).map(async (item) => {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(item.storage_path, 600)
      return { ...item, signed_url: signed?.signedUrl ?? null }
    }))

    return NextResponse.json({ ok: true, attachments })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '첨부파일을 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })

    const body = await request.json().catch(() => null) as Json | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const action = text(body.action, 30).toLowerCase()
    const supabase = createMoniServiceRoleClient()
    const page = cleanPage(body.page as PageContext | undefined)

    if (action === 'prepare') {
      const fileName = safeFileName(text(body.file_name, 240))
      const mimeType = text(body.mime_type, 180).toLowerCase() || 'application/octet-stream'
      const sizeBytes = Math.trunc(numberValue(body.size_bytes))
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return NextResponse.json({ ok: false, error: '지원하지 않는 파일 형식입니다.' }, { status: 400 })
      }
      if (sizeBytes <= 0 || sizeBytes > MAX_FILE_SIZE) {
        return NextResponse.json({ ok: false, error: '파일은 25MB 이하만 첨부할 수 있습니다.' }, { status: 400 })
      }

      const thread = await ensureThread(supabase, session, text(body.thread_id, 80), page)
      const storagePath = `${BUSINESS_ID}/${thread.id}/${randomUUID()}-${fileName}`
      const { data: attachment, error: insertError } = await supabase
        .from('moni_ai_attachments')
        .insert({
          business_id: BUSINESS_ID,
          thread_id: thread.id,
          file_name: fileName,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          storage_bucket: BUCKET,
          storage_path: storagePath,
          upload_status: 'UPLOADING',
          metadata: { source: 'moni_ai_chat' },
        })
        .select('*')
        .single()
      if (insertError) throw new Error(insertError.message)

      const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath)
      if (signedError || !signed?.token) {
        await supabase.from('moni_ai_attachments').update({ upload_status: 'FAILED' }).eq('id', attachment.id)
        throw new Error(signedError?.message || '업로드 주소를 만들지 못했습니다.')
      }

      return NextResponse.json({
        ok: true,
        thread_id: thread.id,
        attachment_id: attachment.id,
        bucket: BUCKET,
        path: storagePath,
        token: signed.token,
      })
    }

    const threadId = text(body.thread_id, 80)
    const attachmentId = text(body.attachment_id, 80)
    if (!threadId || !attachmentId) {
      return NextResponse.json({ ok: false, error: '대화방과 첨부파일 ID가 필요합니다.' }, { status: 400 })
    }

    const { data: attachment, error: attachmentError } = await supabase
      .from('moni_ai_attachments')
      .select('*, moni_ai_threads!inner(user_login_id)')
      .eq('id', attachmentId)
      .eq('thread_id', threadId)
      .eq('business_id', BUSINESS_ID)
      .eq('moni_ai_threads.user_login_id', session.loginId)
      .maybeSingle()
    if (attachmentError) throw new Error(attachmentError.message)
    if (!attachment) return NextResponse.json({ ok: false, error: '첨부파일을 찾을 수 없습니다.' }, { status: 404 })

    if (action === 'complete') {
      const slash = attachment.storage_path.lastIndexOf('/')
      const folder = attachment.storage_path.slice(0, slash)
      const name = attachment.storage_path.slice(slash + 1)
      const { data: objects, error: listError } = await supabase.storage.from(BUCKET).list(folder, { search: name, limit: 2 })
      if (listError) throw new Error(listError.message)
      if (!(objects ?? []).some((item) => item.name === name)) {
        return NextResponse.json({ ok: false, error: '업로드된 파일을 확인할 수 없습니다.' }, { status: 409 })
      }
      const { data, error } = await supabase
        .from('moni_ai_attachments')
        .update({ upload_status: 'READY', updated_at: new Date().toISOString() })
        .eq('id', attachmentId)
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, attachment: data })
    }

    if (action === 'delete') {
      await supabase.storage.from(BUCKET).remove([attachment.storage_path])
      const { error } = await supabase.from('moni_ai_attachments').delete().eq('id', attachmentId)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }

    if (action === 'fail') {
      await supabase.from('moni_ai_attachments').update({ upload_status: 'FAILED', updated_at: new Date().toISOString() }).eq('id', attachmentId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: '지원하지 않는 작업입니다.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '첨부파일 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
