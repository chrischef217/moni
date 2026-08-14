import { NextRequest, NextResponse } from 'next/server'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const text = (value: unknown, max = 20000) => String(value ?? '').trim().slice(0, max)

type ReportBody = { thread_id?: string; assistant_message_id?: string }

function cleanInlineMarkdown(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .trim()
}

function answerParagraphs(markdown: string) {
  const paragraphs: Paragraph[] = []
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      paragraphs.push(new Paragraph({ text: '' }))
      continue
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      paragraphs.push(new Paragraph({
        text: cleanInlineMarkdown(heading[2]),
        heading: heading[1].length === 1 ? HeadingLevel.HEADING_1 : heading[1].length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: 180, after: 80 },
      }))
      continue
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      paragraphs.push(new Paragraph({
        children: [new TextRun(cleanInlineMarkdown(bullet[1]))],
        bullet: { level: 0 },
        spacing: { after: 50 },
      }))
      continue
    }
    const numbered = line.match(/^\d+[.)]\s+(.+)$/)
    if (numbered) {
      paragraphs.push(new Paragraph({
        children: [new TextRun(cleanInlineMarkdown(line))],
        spacing: { after: 50 },
      }))
      continue
    }
    if (/^\|.*\|$/.test(line)) {
      const cells = line.split('|').map((cell) => cleanInlineMarkdown(cell)).filter(Boolean)
      if (cells.length && !cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
        paragraphs.push(new Paragraph({ text: cells.join('  ·  '), spacing: { after: 45 } }))
      }
      continue
    }
    paragraphs.push(new Paragraph({
      children: [new TextRun(cleanInlineMarkdown(line))],
      spacing: { after: 70 },
    }))
  }
  return paragraphs
}

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

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
    const body = await request.json().catch(() => null) as ReportBody | null
    const threadId = text(body?.thread_id, 80)
    const messageId = text(body?.assistant_message_id, 80)
    if (!threadId || !messageId) return NextResponse.json({ ok: false, error: '보고서 대상 답변이 필요합니다.' }, { status: 400 })

    const supabase = createMoniServiceRoleClient()
    const { data: thread, error: threadError } = await supabase.from('moni_ai_threads')
      .select('id,title,user_login_id')
      .eq('id', threadId).eq('business_id', BUSINESS_ID).eq('user_login_id', session.loginId).maybeSingle()
    if (threadError) throw new Error(threadError.message)
    if (!thread) return NextResponse.json({ ok: false, error: 'MONI 대화방을 찾을 수 없습니다.' }, { status: 404 })

    const { data: answer, error: answerError } = await supabase.from('moni_ai_messages')
      .select('id,content,created_at')
      .eq('id', messageId).eq('thread_id', threadId).eq('business_id', BUSINESS_ID).eq('role', 'assistant').maybeSingle()
    if (answerError) throw new Error(answerError.message)
    if (!answer) return NextResponse.json({ ok: false, error: '보고서로 만들 MONI 답변을 찾을 수 없습니다.' }, { status: 404 })

    const { data: question, error: questionError } = await supabase.from('moni_ai_messages')
      .select('content,created_at')
      .eq('thread_id', threadId).eq('business_id', BUSINESS_ID).eq('role', 'user')
      .lt('created_at', answer.created_at).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (questionError) throw new Error(questionError.message)

    const stamp = seoulStamp()
    const questionText = text(question?.content || '질문 기록 없음', 6000)
    const answerText = text(answer.content, 20000)
    const document = new Document({
      sections: [{
        properties: {
          page: { margin: { top: 1100, right: 1100, bottom: 1100, left: 1100 } },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 180 },
            children: [new TextRun({ text: 'MONI AI 업무 보고서', bold: true, size: 34 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 320 },
            children: [new TextRun({ text: `두배 · ${stamp.display}`, color: '64748B', size: 18 })],
          }),
          new Paragraph({ text: '요청', heading: HeadingLevel.HEADING_1, spacing: { before: 120, after: 90 } }),
          new Paragraph({
            children: [new TextRun({ text: questionText, bold: true })],
            spacing: { after: 260 },
          }),
          new Paragraph({ text: 'MONI 분석 및 답변', heading: HeadingLevel.HEADING_1, spacing: { before: 120, after: 90 } }),
          ...answerParagraphs(answerText),
          new Paragraph({
            spacing: { before: 320 },
            children: [new TextRun({ text: '본 문서는 MONI 대화에서 생성된 답변을 보고서 형식으로 정리한 자료입니다.', color: '64748B', size: 17 })],
          }),
        ],
      }],
    })

    const buffer = await Packer.toBuffer(document)
    const bodyBytes = Uint8Array.from(buffer).buffer
    const filename = `MONI_Report_${stamp.file}.docx`
    return new NextResponse(bodyBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[MONI_ANSWER_REPORT_ERROR]', { message: error instanceof Error ? error.message : 'unknown report error' })
    return NextResponse.json({ ok: false, error: 'MONI 보고서를 만들지 못했습니다.' }, { status: 500 })
  }
}
