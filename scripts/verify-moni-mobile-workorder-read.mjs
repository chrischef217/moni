import fs from 'node:fs'

const source = fs.readFileSync('src/lib/moni/mobile-business-intents.ts', 'utf8')
const runtime = fs.readFileSync('src/lib/moni/agent/conversation-runtime.ts', 'utf8')
const productionTools = fs.readFileSync('src/lib/moni/agent/tools/production.ts', 'utf8')

const checks = [
  [!source.includes("|발행|해줘|해주세요|해 줘)"), 'generic courtesy endings must not be global create intent'],
  [source.includes("작업지시(?:서)?|생산지시"), 'work-order domain routing must remain explicit'],
  [productionTools.includes("name: 'search_production_records'"), 'work-order read tool must remain available'],
  [productionTools.includes('생산 작업지시와 완료실적을 조회한다'), 'work-order read tool must explicitly cover work-order history'],
  [runtime.includes("search_production_records"), 'conversation runtime must keep production record read routing'],
]

const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  for (const [, message] of failed) console.error(`FAIL: ${message}`)
  process.exit(1)
}
console.log('MONI mobile work-order read verification passed.')
