import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const polish = readFileSync('src/components/MoniMobileUxPolish.tsx', 'utf8')
const runtime = readFileSync('src/app/api/moni/agent-runtime/route.ts', 'utf8')
const userFacing = readFileSync('src/lib/moni/agent/user-facing-text.ts', 'utf8')
const pdfRoute = readFileSync('src/app/api/moni/answer-pdf/route.ts', 'utf8')
const statementPdf = readFileSync('src/app/api/moni/sales-statement-pdf/route.ts', 'utf8')
const statementResolver = readFileSync('src/lib/moni/documents/sales-statement-resolver.ts', 'utf8')
const pdfRenderer = readFileSync('src/lib/moni/documents/simple-pdf.ts', 'utf8')
const docxReport = readFileSync('src/app/api/moni/answer-report/route.ts', 'utf8')

test('mobile user question bubble is light and readable', () => {
  assert.match(page, /MoniMobileUxPolish/)
  assert.match(polish, /#def5ee/i)
  assert.match(polish, /#173b52/i)
  assert.match(polish, /#c7e8df/i)
})

test('internal MONI labels are converted before users see answers', () => {
  assert.match(userFacing, /unaccounted[_\\s-]*gap/)
  assert.match(userFacing, /계획-완료 차이/)
  assert.match(userFacing, /search_production_records/)
  assert.match(userFacing, /생산 기록 조회/)
  assert.match(runtime, /sanitizeMoniUserFacingText\(result\.text\)/)
  assert.match(runtime, /safeMessages/)
})

test('PDF requests return an authenticated real PDF download link', () => {
  assert.match(runtime, /isPdfDocumentRequest\(message\)/)
  assert.match(runtime, /removePdfCapabilityRefusal/)
  assert.match(runtime, /\/api\/moni\/answer-pdf\?thread_id=/)
  assert.match(runtime, /assistant_message_id/)
  assert.match(pdfRoute, /getSessionFromRequest/)
  assert.match(pdfRoute, /application\/pdf/)
  assert.match(pdfRoute, /Content-Disposition/)
  assert.match(pdfRoute, /buildMoniReportPdf/)
  assert.match(pdfRenderer, /HYSMyeongJo-Medium/)
  assert.match(pdfRenderer, /KSCms-UHC-H/)
})

test('sales statement requests resolve canonical MONI sales data without guessing', () => {
  assert.match(runtime, /resolveSalesStatementArtifacts/)
  assert.match(runtime, /거래명세표 PDF 다운로드/)
  assert.match(runtime, /MONI 거래명세표 양식 열기/)
  assert.match(runtime, /거래명세표를 만들 거래를 특정해야 합니다/)
  assert.match(statementResolver, /DB-\\d\{8\}-\\d\{3\}/)
  assert.match(statementResolver, /sales_orders/)
  assert.match(statementResolver, /canonical_form_url/)
  assert.match(statementPdf, /sales_order_items/)
  assert.match(statementPdf, /sales_clients/)
  assert.match(statementPdf, /company_profile/)
  assert.match(statementPdf, /buildSalesStatementPdf/)
  assert.match(statementPdf, /application\/pdf/)
})

test('DOCX report preserves markdown tables as real document tables', () => {
  assert.match(docxReport, /TableCell/)
  assert.match(docxReport, /TableRow/)
  assert.match(docxReport, /WidthType\.PERCENTAGE/)
  assert.match(docxReport, /shading:/)
  assert.doesNotMatch(docxReport, /cells\.join\('  ·  '\)/)
})
