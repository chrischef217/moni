import { NextRequest, NextResponse } from 'next/server'
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { createMoniServiceRoleClient } from '@/lib/moni/db'
import { sanitizeMoniUserFacingText, stripGeneratedDocumentLinks } from '@/lib/moni/agent/user-facing-text'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUSINESS_ID = String(process.env.MONI_BUSINESS_ID || '20220523011').trim()
const text = (value: unknown, max = 20000) => String(value ?? '').trim().slice(0, max)

type ReportBody = { thread_id?: string; assistant_message_id?: string }
type ReportBlock = Paragraph | Table

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

function tableBlock(rows: string[][]) {
  const cleanRows = rows.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
  const columnCount = Math.max(1, ...cleanRows.map((row) => row.length))
  return new Table({
    width: { size: '100%', type: WidthType.PERCENTAGE },
    rows: cleanRows.map((row, rowIndex) => new TableRow({
      tableHeader: rowIndex === 0,
      children: Array.from({ length: columnCount }, (_, columnIndex) => new TableCell({
        shading: rowIndex === 0 ? { fill: 'EAF3F1' } : undefined,
        margins: { top: 80, bottom: 80, left: 90, right: 90 },
        children: [new Paragraph({
          children: [new TextRun({
            text: row[columnIndex] || '',
            bold: rowIndex === 0,
            color: rowIndex === 0 ? '173B52' : '263F4D',
            size: rowIndex === 0 ? 20 : 19,
          })],
          spacing: { after: 0 },
        })],
      })),
    })),
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
      const filtered = rows.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
      if (filtered.length) blocks.push(tableBlock(filtered))
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
          new Table({
            width: { size: '100%', type: WidthType.PERCENTAGE },
            rows: [new TableRow({ children: [new TableCell({
              width: { size: '100%', type: WidthType.PERCENTAGE },
              shading: { fill: 'F0F8F6' },
              margins: { top: 120, bottom: 120, left: 140, right: 140 },
              children: [new Paragraph({
                children: [new TextRun({ text: questionText, bold: true, color: '173B52', size: 21 })],
                spacing: { after: 0, line: 300 },
              })],
            })] })],
          }),
          new Paragraph({ text: '', spacing: { after: 100 } }),
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
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[MONI_ANSWER_DOCUMENT_ERROR]', { message: error instanceof Error ? error.message : 'unknown document error' })
    return NextResponse.json({ ok: false, error: 'MONI 답변 문서를 만들지 못했습니다.' }, { status: 500 })
  }
}
