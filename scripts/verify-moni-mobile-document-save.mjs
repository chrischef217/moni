import fs from 'node:fs'

const page = fs.readFileSync('src/app/mobile/page.tsx', 'utf8')
const ux = fs.readFileSync('src/components/MoniMobileDocumentSaveUX.tsx', 'utf8')
const route = fs.readFileSync('src/app/api/moni/answer-report/route.ts', 'utf8')

const checks = [
  [page.includes('MoniMobileDocumentSaveUX'), 'mobile page must mount MoniMobileDocumentSaveUX'],
  [ux.includes(".moni-answer-report"), 'document save UX must intercept the existing document-save button'],
  [ux.includes('role="progressbar"'), 'document save UX must show a progress bar'],
  [ux.includes('문서 보기'), 'document save UX must expose a document view button'],
  [ux.includes("response.body.getReader()"), 'document save UX must track streamed download progress'],
  [route.includes("'Content-Length': String(bodyBytes.byteLength)"), 'answer report must expose content length'],
  [route.includes('function tableBlocks'), 'answer report must convert markdown tables to paragraph records'],
  [route.includes('Some Android DOCX viewers collapse Word tables'), 'answer report must document the Android viewer compatibility reason'],
  [!route.includes('new Table('), 'answer report must not emit Word tables that collapse in Android viewers'],
  [!route.includes('TableCell'), 'answer report must not depend on table cells for question or answer layout'],
  [route.includes("shading: { fill: 'F0F8F6' }"), 'question block must use a full-width paragraph treatment'],
]

const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  for (const [, message] of failed) console.error(`FAIL: ${message}`)
  process.exit(1)
}

console.log('MONI mobile document save verification passed.')
