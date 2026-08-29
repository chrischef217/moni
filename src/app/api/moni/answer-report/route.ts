import { NextRequest, NextResponse } from 'next/server'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { sanitizeMoniUserFacingText, stripGeneratedDocumentLinks } from '@/lib/moni/agent/user-facing-text'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const text = (value: unknown, max = 20000) => String(value ?? '').trim().slice(0, max)

type ReportBody = { thread_id?: string; assistant_message_id?: string }
type ReportBlock = Paragraph

function cleanInlineMarkdown(value: string) {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .trim()
}

function parseTableLine(line: string) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cleanInlineMarkdown(cell.trim()))
}

/**
 * Some Android DOCX viewers collapse Word tables into 1-character-wide columns even
 * when fixed DXA widths are supplied. Answer documents are primarily consumed on
 * mobile, so markdown tables are rendered as full-width paragraph records instead.
 * This preserves every header/value pair while avoiding viewer-specific table layout.
 */
function tableBlocks(rows: string[][]): Paragraph[] {
  const cleanRows = rows.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
  if (!cleanRows.length) return []

  const headers = cleanRows[0]
  const bodyRows = cleanRows.slice(1)
  if (!bodyRows.length) {
    return [new Paragraph({
      children: [new TextRun({ text: headers.join(' · '), bold: true, size: 20, color: '173B52' })],
      shading: { fill: 'EEF7F5' },
      indent: { left: 160, right: 160 },
      spacing: { before: 60, after: 110, line: 300 },
    })]
  }

  return bodyRows.map((row, rowIndex) => {
    const children: TextRun[] = [
      new TextRun({ text: `${rowIndex + 1}. `, bold: true, size: 20, color: '16866F' }),
    ]

    headers.forEach((header, columnIndex) => {
      if (columnIndex > 0) children.push(new TextRun({ text: '   ·   ', size: 18, color: '94A8B0' }))
      children.push(new TextRun({
        text: `${header || `항목 ${columnIndex + 1}`}: `,
        bold: true,
        size: 19,
        color: '173B52',
      }))
      children.push(new TextRun({
        text: row[columnIndex] || '-',
        size: 19,
        color: '263F4D',
      }))
    })

    return new Paragraph({
      children,
      shading: { fill: rowIndex % 2 === 0 ? 'F7FBFA' : 'FFFFFF' },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D9E7E4', space: 5 },
      },
      indent: { left: 120, right: 120 },
      spacing: { before: 80, after: 90, line: 300 },
      keepLines: true,
    })
  })
}

function answerBlocks(markdown: string) {
  const blocks: ReportBlock[] = []
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  let index = 0
  while (index < lines.length) {
    const raw = lines[index]
    const line = raw.trim()
    if (!line) {
      blocks.push(new Paragraph({ text: '', spacing: { after: 20 } }))
      index += 1
      continue
    }

    if (/^\|.*\|$/.test(line)) {
      const rows: string[][] = []
      while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
        rows.push(parseTableLine(lines[index]))
        index += 1
      }
      blocks.push(...tableBlocks(rows))
      blocks.push(new Paragraph({ text: '', spacing: { after: 70 } }))
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    if (heading) {
      blocks.push(new Paragraph({
        text: cleanInlineMarkdown(heading[2]),
        heading: heading[1].length === 1 ? HeadingLevel.HEADING_1 : heading[1].length === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: 220, after: 90 },
      }))
      index += 1
      continue
    }

    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      blocks.push(new Paragraph({
        children: [new TextRun({ text: cleanInlineMarkdown(bullet[1]), size: 21, color: '263F4D' })],
        bullet: { level: 0 },
        spacing: { after: 70 },
      }))
      index += 1
      continue
    }

    const numbered = line.match(/^(\d+[.)])\s+(.+)$/)
    if (numbered) {
      blocks.push(new Paragraph({
        children: [
          new TextRun({ text: `${numbered[1]} `, bold: true, size: 21, color: '173B52' }),
          new TextRun({ text: cleanInlineMarkdown(numbered[2]), size: 21, color: '263F4D' }),
        ],
        spacing: { after: 70 },
      }))
      index += 1
      continue
    }

    blocks.push(new Paragraph({
      children: [new TextRun({ text: cleanInlineMarkdown(line), size: 21, color: '263F4D' })],
      spacing: { after: 90, line: 310 },
    }))
    index += 1
  }
  return blocks
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
    if (!threadId || !messageId) return NextResponse.json({ ok: false, error: '문서로 저장할 답변이 필요합니다.' }, { status: 400 })

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
    if (!answer) return NextResponse.json({ ok: false, error: '문서로 저장할 MONI 답변을 찾을 수 없습니다.' }, { status: 404 })

    const { data: question, error: questionError } = await supabase.from('moni_ai_messages')
      .select('content,created_at')
      .eq('thread_id', threadId).eq('business_id', BUSINESS_ID).eq('role', 'user')
      .lt('created_at', answer.created_at).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (questionError) throw new Error(questionError.message)

    const stamp = seoulStamp()
    const questionText = text(question?.content || '질문 기록 없음', 6000)
    const answerText = stripGeneratedDocumentLinks(sanitizeMoniUserFacingText(text(answer.content, 20000)))

    const document = new Document({
      styles: {
        default: {
          document: { run: { font: 'Malgun Gothic', size: 21, color: '263F4D' } },
        },
      },
      sections: [{
        properties: {
          page: { margin: { top: 950, right: 900, bottom: 900, left: 900 } },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 150 },
            children: [new TextRun({ text: 'MONI 답변 문서', bold: true, size: 38, color: '173B52' })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 280 },
            children: [new TextRun({ text: `두배 · ${stamp.display}`, color: '64748B', size: 18 })],
          }),
          new Paragraph({ text: '질문', heading: HeadingLevel.HEADING_1, spacing: { before: 100, after: 90 } }),
          new Paragraph({
            children: [new TextRun({ text: questionText, bold: true, color: '173B52', size: 21 })],
            shading: { fill: 'F0F8F6' },
            border: {
              left: { style: BorderStyle.SINGLE, size: 10, color: '72B9AA', space: 10 },
              bottom: { style: BorderStyle.SINGLE, size: 3, color: 'DCEBE7', space: 8 },
            },
            indent: { left: 180, right: 180 },
            spacing: { before: 40, after: 160, line: 310 },
          }),
          new Paragraph({ text: 'MONI 답변', heading: HeadingLevel.HEADING_1, spacing: { before: 140, after: 100 } }),
          ...answerBlocks(answerText),
          new Paragraph({
            spacing: { before: 340 },
            children: [new TextRun({ text: '이 문서는 MONI 대화 답변을 문서 형태로 저장한 자료입니다.', color: '64748B', size: 17 })],
          }),
        ],
      }],
    })

    const buffer = await Packer.toBuffer(document)
    const bodyBytes = Uint8Array.from(buffer).buffer
    const filename = `MONI_Answer_${stamp.file}.docx`
    return new NextResponse(bodyBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(bodyBytes.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[MONI_ANSWER_DOCUMENT_ERROR]', { message: error instanceof Error ? error.message : 'unknown document error' })
    return NextResponse.json({ ok: false, error: 'MONI 답변 문서를 만들지 못했습니다.' }, { status: 500 })
  }
}
