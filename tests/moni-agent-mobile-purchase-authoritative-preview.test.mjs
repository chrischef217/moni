import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync('src/app/api/moni/mobile-purchase-actions-v3/route.ts', 'utf8')
const card = readFileSync('src/components/MoniMobilePurchaseCardV2.tsx', 'utf8')
const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const pcPurchase = readFileSync('src/app/api/moni/purchases/route.ts', 'utf8')

test('mobile purchase preview reuses the exact PC master pricing resolver', () => {
  assert.match(route, /resolveMasterPurchasePricing/)
  assert.match(route, /await resolveMasterPurchasePricing\(/)
  assert.match(pcPurchase, /await resolveMasterPurchasePricing\(/)
  assert.doesNotMatch(card, /setField\('unit_price'/)
  assert.match(card, /현재 마스터 가격/)
})

test('purchase confirmation exposes the important PC financial and settlement fields', () => {
  for (const phrase of [
    '마스터 적용 단가:',
    '공급가액:',
    '부가세:',
    '최종 합계(VAT 포함):',
    '지급: 0원',
    '미지급:',
    '지급예정일:',
    '예정 결제수단:',
    '세금계산서:',
  ]) assert.ok(route.includes(phrase), `missing purchase preview phrase: ${phrase}`)
})

test('raw user input and authoritative values are stored separately', () => {
  assert.match(route, /input_snapshot: calc\.input/)
  assert.match(route, /authoritative: calc\.authoritative/)
  assert.match(route, /pricing_fingerprint: calc\.fingerprint/)
  assert.match(route, /cleanInput\(/)
})

test('execute recalculates from original input before acquiring the write lock', () => {
  const recalc = route.indexOf("const live = await calculate(current.data.payload?.input_snapshot || {})")
  const compare = route.indexOf("pricing_fingerprint")
  const claim = route.indexOf("status: 'EXECUTING'")
  assert.ok(recalc > 0)
  assert.ok(compare > 0)
  assert.ok(claim > recalc, 'write claim must occur only after the authoritative recheck')
  assert.match(route, /마스터 단가·세금·지급조건이 변경되었습니다/)
})

test('actual purchase save still delegates to established PC purchase API', () => {
  assert.match(route, /internalJson\(request, '\/api\/moni\/purchases'/)
  assert.match(route, /action: 'create_purchase'/)
  assert.doesNotMatch(route, /from\('purchases'\)\.insert/)
})

test('post-save verification compares PC results to the confirmed values', () => {
  assert.match(route, /function sameSavedPurchase/)
  assert.match(route, /const exactMatch = sameSavedPurchase\(purchase, a\)/)
  assert.match(route, /PC_API_SUCCESS_AND_PREEXECUTION_MASTER_RECHECK_AND_POSTSAVE_MATCH/)
  assert.match(route, /PC_API_SAVED_BUT_POSTSAVE_MISMATCH/)
  assert.match(card, /매입 저장 완료 · 검증 확인 필요/)
})

test('supplier defaults are displayed without being silently copied into user override fields', () => {
  assert.match(card, /const displayedPayment = txt\(fields\.planned_payment_method\) \|\| defaultPayment/)
  assert.match(card, /const displayedTaxInvoice = txt\(fields\.tax_invoice_status\) \|\| defaultTaxInvoice/)
  assert.doesNotMatch(card, /planned_payment_method:txt\(o\.meta\?\.default_payment_method\)/)
  assert.doesNotMatch(card, /tax_invoice_status:o\.meta\?\.tax_invoice_required/)
})

test('purchase V2 card is mounted and viewport-contained', () => {
  assert.match(page, /MoniMobilePurchaseCardV2/)
  assert.match(page, /<MoniMobilePurchaseCardV2 \/>/)
  assert.match(card, /width:min\(100%,720px\)/)
  assert.match(card, /max-width:100%/)
  assert.match(card, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/)
})

test('purchase card preserves stable input elements during typing', () => {
  assert.match(card, /function SearchSelect\(/)
  assert.match(card, /function Field\(/)
  assert.doesNotMatch(card, /function DraftFields\(/)
  assert.match(card, /document\.activeElement/)
})
