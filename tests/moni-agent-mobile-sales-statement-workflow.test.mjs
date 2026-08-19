import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const intents = readFileSync('src/lib/moni/mobile-business-intents.ts', 'utf8')
const adapter = readFileSync('src/app/api/moni/mobile-business-actions-v2/route.ts', 'utf8')
const card = readFileSync('src/components/MoniMobileSalesStatementCard.tsx', 'utf8')
const legacyCard = readFileSync('src/components/MoniMobileBusinessCards.tsx', 'utf8')
const pdf = readFileSync('src/app/api/moni/sales-statement-pdf/route.ts', 'utf8')
const page = readFileSync('src/app/mobile/page.tsx', 'utf8')

test('statement intent is separate from ordinary sales and supports read-only SHOW', () => {
  assert.match(intents, /\| 'sales_statement'/)
  assert.match(intents, /\| 'SHOW'/)
  assert.match(intents, /domain: 'sales_statement', operation: 'SHOW'/)
  assert.match(intents, /domain: 'sales_statement', operation: 'CREATE'/)
  assert.doesNotMatch(intents, /\(판매\|납품\|거래명세\|매출\)/)
  assert.match(intents, /if \(has\(text, \/거래\\s\*명세/)
})

test('statement SHOW reads the latest executed sale in the same thread and never creates a confirmation', () => {
  assert.match(adapter, /latestStatementCard/)
  assert.match(adapter, /action_domain', \['mobile_sales_order', 'mobile_sales_statement'\]/)
  assert.match(adapter, /CANONICAL_SALES_ORDER_READ/)
  assert.match(adapter, /intent\.domain === 'sales_statement' && intent\.operation === 'SHOW'/)
  assert.match(adapter, /card: await latestStatementCard/)
})

test('sales confirmation exposes PC-list financial values before execute', () => {
  for (const phrase of ['공급가액:', '부가세(', '최종 합계(VAT 포함):', '입금: 0원', '미수:', '입금예정일:', '거래 상태:']) {
    assert.ok(adapter.includes(phrase), `missing preview phrase: ${phrase}`)
  }
  assert.match(adapter, /quantity \* unitPrice/)
  assert.match(adapter, /suggestedDueDate/)
})

test('sales client picker is sales-client based, enriched instead of destructively filtering dual-role companies', () => {
  assert.match(adapter, /from\('sales_clients'\)/)
  assert.match(adapter, /also_supplier/)
  assert.match(adapter, /sales_order_count/)
  assert.match(adapter, /sales_term_count/)
  assert.match(card, /매출 거래처/)
  assert.match(card, /매입처에도 등록/)
})

test('tax treatment and due date are explicit in the mobile sales form', () => {
  assert.match(adapter, /tax_type/)
  assert.match(adapter, /EXEMPT/)
  assert.match(adapter, /vat_rate: vatRate/)
  assert.match(card, /부가세율\(%\)/)
  assert.match(card, /입금예정일/)
  assert.match(card, /최종 합계 \(VAT 포함\)/)
})

test('dedicated sales card is mounted and uses stable top-level input components', () => {
  assert.match(page, /MoniMobileSalesStatementCard/)
  assert.match(page, /<MoniMobileSalesStatementCard \/>/)
  assert.match(card, /function SearchSelect\(/)
  assert.match(card, /function Field\(/)
  assert.doesNotMatch(card, /function DraftFields\(\)/)
})

test('legacy core business editable subtree must not be mounted as nested React component', () => {
  assert.doesNotMatch(legacyCard, /<DraftFields\s*\/>/)
  assert.match(legacyCard, /\{DraftFields\(\)\}/)
})

test('mobile sales item inputs are width-contained', () => {
  assert.match(card, /min-width:0/)
  assert.match(card, /max-width:100%/)
  assert.match(card, /grid-template-columns:minmax\(0,1fr\)/)
  assert.match(card, /width:100%/)
})

test('statement completion exposes inline view and download URLs', () => {
  assert.match(adapter, /sales-statement-pdf\?order_id=/)
  assert.match(card, /거래명세표 보기/)
  assert.match(card, /PDF 저장/)
  assert.match(pdf, /mode'\) === 'inline'/)
  assert.match(pdf, /\? 'inline' : 'attachment'/)
})
