import fs from 'node:fs'

const source = fs.readFileSync('src/components/MoniMobileDocumentSaveUX.tsx', 'utf8')
const required = ['문서 저장 중', '파일을 다운로드하고 있습니다.', '문서 저장 완료', '문서 보기', '닫기']
const missing = required.filter((value) => !source.includes(value))
if (missing.length) {
  console.error(`FAIL: missing document save UX copy: ${missing.join(', ')}`)
  process.exit(1)
}
console.log('MONI mobile document save copy verification passed.')
