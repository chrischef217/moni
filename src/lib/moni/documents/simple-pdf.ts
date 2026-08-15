import * as iconv from 'iconv-lite'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 44
const TOP = 48
const BOTTOM = 46
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const COLORS = {
  navy: [0.09, 0.23, 0.32] as const,
  blue: [0.18, 0.32, 0.72] as const,
  mint: [0.92, 0.97, 0.96] as const,
  line: [0.78, 0.84, 0.86] as const,
  muted: [0.38, 0.47, 0.52] as const,
  white: [1, 1, 1] as const,
  black: [0.08, 0.10, 0.12] as const,
}

type Rgb = readonly [number, number, number]
type Page = { commands: string[] }
type Cell = { text: string; align?: 'left' | 'right' | 'center' }

export type SalesStatementPdfInput = {
  statementNumber: string
  saleDate: string
  supplier: {
    companyName: string
    registrationNumber?: string
    representative?: string
    address?: string
    phone?: string
    businessType?: string
    businessItems?: string
  }
  buyer: {
    companyName: string
    address?: string
    phone?: string
  }
  currency: string
  items: Array<{
    name: string
    specification?: string
    quantity: number
    unit?: string
    unitPrice: number
    amount: number
  }>
  supplyAmount: number
  vatAmount: number
  totalAmount: number
  note?: string
}

function safe(value: unknown, max = 20_000) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[•●▪]/g, '-')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .slice(0, max)
}

function cleanInlineMarkdown(value: string) {
  return safe(value)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function cp949Hex(value: string) {
  return iconv.encode(safe(value), 'cp949').toString('hex').toUpperCase()
}

function n(value: number) {
  return Number(value.toFixed(2)).toString()
}

function fillColor(color: Rgb) {
  return `${n(color[0])} ${n(color[1])} ${n(color[2])} rg`
}

function strokeColor(color: Rgb) {
  return `${n(color[0])} ${n(color[1])} ${n(color[2])} RG`
}

function isWide(char: string) {
  return /[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]/.test(char)
}

function textWidth(value: string, fontSize: number) {
  let width = 0
  for (const char of value) width += isWide(char) ? fontSize * 0.92 : fontSize * 0.52
  return width
}

function wrapText(value: string, maxWidth: number, fontSize: number, maxLines = 50) {
  const input = cleanInlineMarkdown(value)
  if (!input) return ['']
  const lines: string[] = []
  let current = ''
  for (const char of input) {
    const next = current + char
    if (current && textWidth(next, fontSize) > maxWidth) {
      lines.push(current.trimEnd())
      current = char === ' ' ? '' : char
      if (lines.length >= maxLines) break
    } else {
      current = next
    }
  }
  if (current && lines.length < maxLines) lines.push(current.trimEnd())
  if (!lines.length) lines.push(input)
  return lines
}

function writeText(page: Page, value: string, x: number, yFromTop: number, fontSize = 10, color: Rgb = COLORS.black, align: 'left' | 'right' | 'center' = 'left', width = 0) {
  const content = safe(value)
  if (!content) return
  let drawX = x
  if (width > 0 && align !== 'left') {
    const measured = textWidth(content, fontSize)
    drawX = align === 'center' ? x + Math.max(0, (width - measured) / 2) : x + Math.max(0, width - measured)
  }
  const y = PAGE_HEIGHT - yFromTop
  const characterSpacing = fontSize >= 13 ? -0.42 : -0.28
  page.commands.push(`BT /F1 ${n(fontSize)} Tf ${n(characterSpacing)} Tc ${fillColor(color)} ${n(drawX)} ${n(y)} Td <${cp949Hex(content)}> Tj ET`)
}

function drawLine(page: Page, x1: number, y1Top: number, x2: number, y2Top: number, color: Rgb = COLORS.line, width = 0.7) {
  const y1 = PAGE_HEIGHT - y1Top
  const y2 = PAGE_HEIGHT - y2Top
  page.commands.push(`q ${strokeColor(color)} ${n(width)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S Q`)
}

function drawRect(page: Page, x: number, yTop: number, width: number, height: number, fill?: Rgb, stroke: Rgb = COLORS.line, strokeWidth = 0.6) {
  const y = PAGE_HEIGHT - yTop - height
  const parts = ['q']
  if (fill) parts.push(fillColor(fill))
  parts.push(strokeColor(stroke), `${n(strokeWidth)} w`, `${n(x)} ${n(y)} ${n(width)} ${n(height)} re`, fill ? 'B' : 'S', 'Q')
  page.commands.push(parts.join(' '))
}

class PdfLayout {
  pages: Page[] = [{ commands: [] }]
  cursor = TOP
  continuationTitle = 'MONI 문서'

  get page() { return this.pages[this.pages.length - 1] }

  ensure(height: number) {
    if (this.cursor + height <= PAGE_HEIGHT - BOTTOM) return
    this.pages.push({ commands: [] })
    this.cursor = TOP
    this.header(this.continuationTitle, true)
  }

  gap(height = 8) { this.cursor += height }

  header(title: string, continuation = false) {
    if (!continuation) this.continuationTitle = title
    this.ensure(50)
    writeText(this.page, title, MARGIN_X, this.cursor + 15, continuation ? 13 : 18, COLORS.navy)
    if (continuation) writeText(this.page, '계속', PAGE_WIDTH - MARGIN_X - 45, this.cursor + 15, 8, COLORS.muted, 'right', 45)
    drawLine(this.page, MARGIN_X, this.cursor + 26, PAGE_WIDTH - MARGIN_X, this.cursor + 26, COLORS.blue, 1.2)
    this.cursor += 38
  }

  meta(left: string, right?: string) {
    this.ensure(22)
    writeText(this.page, left, MARGIN_X, this.cursor + 10, 8.5, COLORS.muted)
    if (right) writeText(this.page, right, MARGIN_X, this.cursor + 10, 8.5, COLORS.muted, 'right', CONTENT_WIDTH)
    this.cursor += 18
  }

  heading(value: string, level = 1) {
    const size = level === 1 ? 13 : 11
    this.ensure(30)
    writeText(this.page, cleanInlineMarkdown(value), MARGIN_X, this.cursor + 14, size, level === 1 ? COLORS.navy : COLORS.blue)
    this.cursor += level === 1 ? 27 : 23
  }

  paragraph(value: string, options?: { bullet?: string; bold?: boolean; color?: Rgb }) {
    const fontSize = options?.bold ? 10.5 : 9.6
    const bullet = options?.bullet || ''
    const indent = bullet ? 14 : 0
    const lines = wrapText(value, CONTENT_WIDTH - indent, fontSize, 80)
    const height = lines.length * 14 + 3
    this.ensure(height)
    if (bullet) writeText(this.page, bullet, MARGIN_X, this.cursor + 10.5, fontSize, options?.color || COLORS.black)
    lines.forEach((line, index) => writeText(this.page, line, MARGIN_X + indent, this.cursor + 10.5 + index * 14, fontSize, options?.color || COLORS.black))
    this.cursor += height
  }

  callout(value: string) {
    const lines = wrapText(value, CONTENT_WIDTH - 22, 9.4, 20)
    const height = Math.max(38, lines.length * 14 + 18)
    this.ensure(height + 7)
    drawRect(this.page, MARGIN_X, this.cursor, CONTENT_WIDTH, height, COLORS.mint, COLORS.line, 0.6)
    lines.forEach((line, index) => writeText(this.page, line, MARGIN_X + 11, this.cursor + 17 + index * 14, 9.4, COLORS.navy))
    this.cursor += height + 8
  }

  table(rows: Cell[][], widths?: number[]) {
    if (!rows.length) return
    const colCount = Math.max(...rows.map((row) => row.length))
    const colWidths = widths && widths.length === colCount
      ? widths
      : Array.from({ length: colCount }, () => CONTENT_WIDTH / colCount)
    const normalizedWidths = (() => {
      const sum = colWidths.reduce((a, b) => a + b, 0)
      return colWidths.map((value) => value * CONTENT_WIDTH / sum)
    })()

    rows.forEach((row, rowIndex) => {
      const fontSize = rowIndex === 0 ? 8.8 : 8.4
      const wrapped = Array.from({ length: colCount }, (_, columnIndex) => {
        const cell = row[columnIndex] || { text: '' }
        return wrapText(cell.text, normalizedWidths[columnIndex] - 10, fontSize, 6)
      })
      const lines = Math.max(1, ...wrapped.map((parts) => parts.length))
      const rowHeight = Math.max(rowIndex === 0 ? 27 : 24, lines * 11 + 10)
      this.ensure(rowHeight + 2)
      let x = MARGIN_X
      for (let columnIndex = 0; columnIndex < colCount; columnIndex += 1) {
        const cell = row[columnIndex] || { text: '' }
        const width = normalizedWidths[columnIndex]
        drawRect(this.page, x, this.cursor, width, rowHeight, rowIndex === 0 ? [0.92, 0.95, 0.98] : COLORS.white, COLORS.line, 0.55)
        wrapped[columnIndex].forEach((line, lineIndex) => {
          writeText(this.page, line, x + 5, this.cursor + 15 + lineIndex * 11, fontSize, rowIndex === 0 ? COLORS.navy : COLORS.black, cell.align || 'left', width - 10)
        })
        x += width
      }
      this.cursor += rowHeight
    })
    this.cursor += 8
  }

  footer(value: string) {
    const y = PAGE_HEIGHT - 22
    for (const page of this.pages) {
      drawLine(page, MARGIN_X, y - 12, PAGE_WIDTH - MARGIN_X, y - 12, COLORS.line, 0.45)
      writeText(page, value, MARGIN_X, y, 7.4, COLORS.muted)
    }
  }
}

function parseMarkdownTable(lines: string[], start: number) {
  const tableLines: string[] = []
  let index = start
  while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
    tableLines.push(lines[index])
    index += 1
  }
  const rows = tableLines
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cleanInlineMarkdown(cell.trim())))
    .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
  return { rows, next: index }
}

function renderMarkdown(layout: PdfLayout, markdown: string) {
  const lines = safe(markdown).split('\n')
  let index = 0
  while (index < lines.length) {
    const raw = lines[index]
    const line = raw.trim()
    if (!line) { layout.gap(4); index += 1; continue }
    if (/^\|.*\|$/.test(line)) {
      const parsed = parseMarkdownTable(lines, index)
      if (parsed.rows.length) {
        layout.table(parsed.rows.map((row) => row.map((cell) => ({ text: cell }))))
      }
      index = parsed.next
      continue
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      layout.heading(heading[2], heading[1].length <= 2 ? 1 : 2)
      index += 1
      continue
    }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      layout.paragraph(bullet[1], { bullet: '-' })
      index += 1
      continue
    }
    const numbered = line.match(/^(\d+[.)])\s+(.+)$/)
    if (numbered) {
      layout.paragraph(numbered[2], { bullet: numbered[1] })
      index += 1
      continue
    }
    layout.paragraph(line)
    index += 1
  }
}

function buildPdf(pages: Page[]) {
  const objects: Buffer[] = []
  const setObject = (id: number, content: Buffer | string) => { objects[id - 1] = Buffer.isBuffer(content) ? content : Buffer.from(content, 'latin1') }
  const addObject = (content: Buffer | string) => {
    const id = objects.length + 1
    setObject(id, content)
    return id
  }

  setObject(1, '<< /Type /Catalog /Pages 2 0 R >>')
  setObject(2, '<< >>')
  setObject(3, '<< /Type /Font /Subtype /Type0 /BaseFont /HYGoThic-Medium /Encoding /KSCms-UHC-H /DescendantFonts [4 0 R] >>')
  setObject(4, '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HYGoThic-Medium /CIDSystemInfo << /Registry (Adobe) /Ordering (Korea1) /Supplement 1 >> >>')

  const pageIds: number[] = []
  for (const page of pages) {
    const stream = Buffer.from(page.commands.join('\n'), 'ascii')
    const contentId = addObject(Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'ascii'),
      stream,
      Buffer.from('\nendstream', 'ascii'),
    ]))
    const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(PAGE_WIDTH)} ${n(PAGE_HEIGHT)}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`)
    pageIds.push(pageId)
  }
  setObject(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)

  let output = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary')
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    const id = index + 1
    offsets[id] = output.length
    output = Buffer.concat([output, Buffer.from(`${id} 0 obj\n`, 'ascii'), objects[index], Buffer.from('\nendobj\n', 'ascii')])
  }
  const xrefOffset = output.length
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join('')
  return Buffer.concat([output, Buffer.from(xref, 'ascii')])
}

export function buildMoniReportPdf(input: { title?: string; question: string; answer: string; generatedAt: string }) {
  const layout = new PdfLayout()
  layout.header(input.title || 'MONI 분석 문서')
  layout.meta('두배 · MONI', input.generatedAt)
  layout.heading('질문', 1)
  layout.callout(cleanInlineMarkdown(input.question) || '질문 기록 없음')
  layout.heading('MONI 답변', 1)
  renderMarkdown(layout, input.answer)
  layout.footer('MONI 대화 답변을 문서 형태로 저장한 자료입니다.')
  return buildPdf(layout.pages)
}

function money(value: number, currency: string) {
  const safeValue = Number.isFinite(value) ? value : 0
  const decimals = currency === 'KRW' ? 0 : 2
  return safeValue.toLocaleString('ko-KR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function buildSalesStatementPdf(input: SalesStatementPdfInput) {
  const layout = new PdfLayout()
  layout.header('거래명세표')
  layout.meta(`문서번호 ${input.statementNumber || '-'}`, input.saleDate || '-')
  layout.table([
    [{ text: '공급자' }, { text: input.supplier.companyName }, { text: '공급받는자' }, { text: input.buyer.companyName }],
    [{ text: '등록번호' }, { text: input.supplier.registrationNumber || '-' }, { text: '연락처' }, { text: input.buyer.phone || '-' }],
    [{ text: '대표자' }, { text: input.supplier.representative || '-' }, { text: '주소' }, { text: input.buyer.address || '-' }],
    [{ text: '공급자 주소' }, { text: input.supplier.address || '-' }, { text: '거래일' }, { text: input.saleDate || '-' }],
  ], [75, 180, 75, 180])

  layout.heading('공급 내역', 1)
  const itemRows: Cell[][] = [[
    { text: '품목' }, { text: '규격' }, { text: '수량', align: 'right' }, { text: '단가', align: 'right' }, { text: '금액', align: 'right' },
  ]]
  for (const item of input.items) {
    itemRows.push([
      { text: item.name },
      { text: item.specification || '-' },
      { text: `${item.quantity.toLocaleString('ko-KR')} ${item.unit || ''}`.trim(), align: 'right' },
      { text: money(item.unitPrice, input.currency), align: 'right' },
      { text: money(item.amount, input.currency), align: 'right' },
    ])
  }
  layout.table(itemRows, [180, 100, 70, 80, 90])

  layout.heading('합계', 1)
  layout.table([
    [{ text: '공급가액' }, { text: `${money(input.supplyAmount, input.currency)} ${input.currency}`, align: 'right' }],
    [{ text: '부가세' }, { text: `${money(input.vatAmount, input.currency)} ${input.currency}`, align: 'right' }],
    [{ text: '합계금액' }, { text: `${money(input.totalAmount, input.currency)} ${input.currency}`, align: 'right' }],
  ], [170, 337])

  if (input.note) {
    layout.heading('비고', 2)
    layout.callout(input.note)
  }
  layout.footer('MONI 판매관리의 공식 거래 데이터로 생성된 거래명세표입니다.')
  return buildPdf(layout.pages)
}
