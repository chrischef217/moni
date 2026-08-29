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
  [route.includes('DOCUMENT_TABLE_WIDTH_DXA'), 'answer report must use stable document table width'],
  [route.includes('WidthType.DXA'), 'answer report must avoid collapsed percentage tables in mobile viewers'],
]

const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  for (const [, message] of failed) console.error(`FAIL: ${message}`)
  process.exit(1)
}

console.log('MONI mobile document save verification passed.')
