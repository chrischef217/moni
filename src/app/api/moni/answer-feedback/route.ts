import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const text = (value: unknown, max = 120) => String(value ?? '').trim().slice(0, max)

type FeedbackBody = {
  thread_id?: string
  assistant_message_id?: string
  rating?: 'UP' | 'DOWN' | null
}

async function verifyThreadAndMessage(args: {
  threadId: string
  messageId: string
  loginId: string
}) {
  const supabase = createMoniServiceRoleClient()
  const { data: thread, error: threadError } = await supabase
    .from('moni_ai_threads')
    .select('id')
    .eq('id', args.threadId)
    .eq('business_id', BUSINESS_ID)
    .eq('user_login_id', args.loginId)
    .maybeSingle()
  if (threadError) throw new Error(threadError.message)
  if (!thread) return { supabase, ok: false as const, status: 404, error: 'MONI 대화방을 찾을 수 없습니다.' }

  const { data: message, error: messageError } = await supabase
    .from('moni_ai_messages')
    .select('id,thread_id,role')
    .eq('id', args.messageId)
    .eq('thread_id', args.threadId)
    .eq('business_id', BUSINESS_ID)
    .eq('role', 'assistant')
    .maybeSingle()
  if (messageError) throw new Error(messageError.message)
  if (!message) return { supabase, ok: false as const, status: 404, error: '평가할 MONI 답변을 찾을 수 없습니다.' }
  return { supabase, ok: true as const }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
    const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
    if (!threadId) return NextResponse.json({ ok: true, feedback: {} }, { headers: { 'Cache-Control': 'no-store' } })

    const supabase = createMoniServiceRoleClient()
    const { data: thread, error: threadError } = await supabase.from('moni_ai_threads')
      .select('id').eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', session.loginId).maybeSingle()
    if (threadError) throw new Error(threadError.message)
    if (!thread) return NextResponse.json({ ok: false, error: 'MONI 대화방을 찾을 수 없습니다.' }, { status: 404 })

    const { data, error } = await supabase.from('moni_ai_answer_feedback')
      .select('assistant_message_id,rating,learning_status')
      .eq('business_id', BUSINESS_ID)
      .eq('thread_id', threadId)
      .eq('actor_login_id', session.loginId)
    if (error) throw new Error(error.message)

    const feedback = Object.fromEntries((data ?? []).map((row) => [row.assistant_message_id, {
      rating: row.rating,
      learning_status: row.learning_status,
    }]))
    return NextResponse.json({ ok: true, feedback }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '답변 평가를 불러오지 못했습니다.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
    const body = await request.json().catch(() => null) as FeedbackBody | null
    if (!body) return NextResponse.json({ ok: false, error: '요청 본문이 필요합니다.' }, { status: 400 })

    const threadId = text(body.thread_id, 80)
    const messageId = text(body.assistant_message_id, 80)
    const rating = body.rating
    if (!threadId || !messageId || (rating !== 'UP' && rating !== 'DOWN' && rating !== null)) {
      return NextResponse.json({ ok: false, error: '답변 평가 요청이 올바르지 않습니다.' }, { status: 400 })
    }

    const verified = await verifyThreadAndMessage({ threadId, messageId, loginId: session.loginId })
    if (!verified.ok) return NextResponse.json({ ok: false, error: verified.error }, { status: verified.status })

    if (rating === null) {
      const { error } = await verified.supabase.from('moni_ai_answer_feedback').delete()
        .eq('business_id', BUSINESS_ID)
        .eq('assistant_message_id', messageId)
        .eq('actor_login_id', session.loginId)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, rating: null }, { headers: { 'Cache-Control': 'no-store' } })
    }

    const now = new Date().toISOString()
    const { data, error } = await verified.supabase.from('moni_ai_answer_feedback').upsert({
      business_id: BUSINESS_ID,
      thread_id: threadId,
      assistant_message_id: messageId,
      actor_login_id: session.loginId,
      rating,
      source: 'MOBILE',
      learning_status: 'CANDIDATE',
      updated_at: now,
    }, { onConflict: 'business_id,assistant_message_id,actor_login_id' }).select('rating,learning_status').single()
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, rating: data.rating, learning_status: data.learning_status }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : '답변 평가를 저장하지 못했습니다.' }, { status: 500 })
  }
}
