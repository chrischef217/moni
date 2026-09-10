import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')
const intents = read('src/lib/moni/mobile-business-intents.ts')
const wrapper = read('src/app/api/moni/mobile-sales-export-bundle-v2/route.ts')
const base = read('src/app/api/moni/mobile-sales-export-bundle/route.ts')
const middleware = read('src/middleware.ts')
const page = read('src/app/mobile/page.tsx')
const touch = read('src/components/MoniMobilePhotoTouchGuard.tsx')

const checks = [
  [intents.includes("const statementMention = has(text, /거래\\s*명세(?:표|서)?/)"), '거래명세표/거래명세서 표현을 모두 인식해야 함'],
  [intents.includes("const bravoExportClient = has(text, /(bravo|브라보|부라보)(?:\\s*치킨)?/i)"), 'Bravo/브라보/부라보치킨 별칭을 수출 거래처 문맥으로 인식해야 함'],
  [intents.includes("return { domain: 'sales_export_bundle', operation: 'CREATE' }"), '수출 거래명세표 요청은 sales_export_bundle로 라우팅해야 함'],
  [intents.includes('수출\\s*(?:자료|서류|문서)'), '수출자료/수출서류/수출문서 표현이 번들 생성 요청에 포함되어야 함'],
  [intents.includes("if (statementWrite) return { domain: 'sales_statement', operation: 'CREATE' }"), '일반 국내 거래명세표 작성 경로는 그대로 보존해야 함'],
  [wrapper.includes(".replace(/(?:브라보|부라보)(?:치킨)?/g, 'bravo')"), 'Bravo 현장 별칭은 canonical destination과 연결되어야 함'],
  [wrapper.includes("if (value.startsWith('두배')"), '사용자 제품명에서 두배 prefix 생략을 canonical 수출품목과 안전하게 매칭해야 함'],
  [wrapper.includes("return best.length === 1 ? best[0].option : null"), '제품 자동매칭은 유일한 후보일 때만 허용해야 함'],
  [wrapper.includes("if (/어제(?:\\s*날짜|자로|로)?/i.test(sourceMessage)) return kstDateOffset(-1)"), '어제 날짜 요청은 KST 기준 전일로 결정적으로 변환해야 함'],
  [wrapper.includes("if (unit === 'KG' && num(setting?.net_weight_kg) > 0)"), 'KG 수량은 canonical net kg/CTN으로 CTN을 계산해야 함'],
  [wrapper.includes("return legacyPOST(request)"), '실제 생성/승인 POST는 기존 canonical export 실행 경로를 재사용해야 함'],
  [base.includes("verification_basis: 'EXPORT_DOCUMENT_CREATE_AND_SALES_SYNC_SUCCESS'"), '번들 실행은 수출문서 생성과 매출 동기화를 함께 검증해야 함'],
  [base.includes("'/api/moni/export-sales-sync'"), '수출문서 생성 후 거래명세표 매출 동기화가 유지되어야 함'],
  [middleware.includes("pathname === '/api/moni/mobile-sales-export-bundle'"), '모바일 export bundle 엔드포인트에 V2 보정 레이어를 연결해야 함'],
  [middleware.includes("url.pathname='/api/moni/mobile-sales-export-bundle-v2'"), '모바일 export bundle rewrite 대상이 V2여야 함'],
  [page.includes('<MoniMobileSalesStatementCard />') && page.includes('<MoniMobileSalesExportBundleCard />'), '국내 거래명세표와 수출 번들 UI를 둘 다 유지해야 함'],
  [!touch.includes('window.setInterval('), '이번 판매/수출 회귀 수정에서도 공격적 터치 watchdog이 재도입되면 안 됨'],
  [!touch.includes("style.setProperty('pointer-events', 'none', 'important')"), '이번 수정은 기존 정상 터치 경로를 다시 전역 차단하면 안 됨'],
]

const failed = checks.filter(([ok]) => !ok)
if (failed.length) {
  for (const [, message] of failed) console.error(`FAIL: ${message}`)
  process.exit(1)
}

console.log('MONI mobile sales/export regression verification passed.')
