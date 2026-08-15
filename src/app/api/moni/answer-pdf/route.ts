import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { buildMoniReportPdf } from '@/lib/moni/documents/simple-pdf'
import {
  removePdfCapabilityRefusal,
  sanitizeMoniUserFacingText,
  stripGeneratedDocumentLinks,
} from '@/lib/moni/agent/user-facing-text'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const text = (value: unknown, max = 20_000) => String(value ?? '').trim().slice(0, max)

function seoulStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  return {
    display: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} KST`,
    file: `${get('year')}${get('month')}${get('day')}_${get('hour')}${get('minute')}`,
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })

    const threadId = text(request.nextUrl.searchParams.get('thread_id'), 80)
    const messageId = text(request.nextUrl.searchParams.get('assistant_message_id'), 80)
    if (!threadId || !messageId) {
      return NextResponse.json({ ok: false, error: 'PDF로 만들 MONI 답변이 필요합니다.' }, { status: 400 })
    }

    const supabase = createMoniServiceRoleClient()
    const { data: thread, error: threadError } = await supabase.from('moni_ai_threads')
      .select('id,user_login_id')
      .eq('id', threadId)
      .eq('business_id', BUSINESS_ID)
      .eq('user_login_id', session.loginId)
      .maybeSingle()
    if (threadError) throw new Error(threadError.message)
    if (!thread) return NextResponse.json({ ok: false, error: 'MONI 대화방을 찾을 수 없습니다.' }, { status: 404 })

    const { data: answer, error: answerError } = await supabase.from('moni_ai_messages')
      .select('id,content,created_at')
      .eq('id', messageId)
      .eq('thread_id', threadId)
      .eq('business_id', BUSINESS_ID)
      .eq('role', 'assistant')
      .maybeSingle()
    if (answerError) throw new Error(answerError.message)
    if (!answer) return NextResponse.json({ ok: false, error: 'PDF로 만들 MONI 답변을 찾을 수 없습니다.' }, { status: 404 })

    const { data: question, error: questionError } = await supabase.from('moni_ai_messages')
      .select('content,created_at')
      .eq('thread_id', threadId)
      .eq('business_id', BUSINESS_ID)
      .eq('role', 'user')
      .lt('created_at', answer.created_at)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (questionError) throw new Error(questionError.message)

    const stamp = seoulStamp()
    const answerText = stripGeneratedDocumentLinks(
      sanitizeMoniUserFacingText(removePdfCapabilityRefusal(text(answer.content, 20_000))),
    )
    const pdf = buildMoniReportPdf({
      title: 'MONI 분석 문서',
      question: text(question?.content || '질문 기록 없음', 6000),
      answer: answerText,
      generatedAt: stamp.display,
    })
    const filename = `MONI_Document_${stamp.file}.pdf`

    return new Response(Uint8Array.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('[MONI_ANSWER_PDF_ERROR]', { message: error instanceof Error ? error.message : 'unknown PDF error' })
    return NextResponse.json({ ok: false, error: 'MONI PDF를 만들지 못했습니다.' }, { status: 500 })
  }
}
