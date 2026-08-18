import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const catalogRoute = readFileSync('src/app/api/moni/mobile-material-catalog/route.ts', 'utf8')
const card = readFileSync('src/components/MoniMobileRawMaterialCardV2.tsx', 'utf8')
const inventoryTools = readFileSync('src/lib/moni/agent/tools/inventory.ts', 'utf8')

test('mobile raw material catalog returns every active master row instead of only stock-managed rows', () => {
  assert.match(catalogRoute, /\.eq\('is_active', true\)/)
  assert.doesNotMatch(catalogRoute, /\.eq\('is_stock_managed', true\)/)
  assert.match(catalogRoute, /is_stock_managed: material\.is_stock_managed === true/)
  assert.match(catalogRoute, /\.limit\(1000\)/)
})

test('catalog ignores reconciliation rows when deriving normal inbound defaults', () => {
  assert.match(catalogRoute, /MONI_STOCK_RECONCILIATION/)
  assert.match(catalogRoute, /recentTransactions = \(data \?\? \[\]\)\.filter/)
  assert.match(catalogRoute, /최근 정상 입고 이력/)
})

test('V2 mobile card exposes the full searchable material list and keeps unmanaged rows visible as status', () => {
  assert.match(page, /MoniMobileRawMaterialCardV2/)
  assert.match(card, /원재료명 또는 코드를 입력해서 전체 목록 검색/)
  assert.match(card, /normalize\(item\.name\)\.includes\(q\)/)
  assert.match(card, /normalize\(item\.item_code\)\.includes\(q\)/)
  assert.match(card, /재고관리 미설정/)
  assert.match(card, /활성 원재료 \{catalog\.length\}개 전체 · 입고 가능/)
})

test('selected material prefills linked supplier, pack weight and operational package price while inputs remain editable', () => {
  assert.match(catalogRoute, /default_supplier/)
  assert.match(catalogRoute, /packing_weight_source/)
  assert.match(catalogRoute, /unit_price_source/)
  assert.match(card, /supplier: material\.default_supplier \|\| ''/)
  assert.match(card, /packing_weight_g: material\.packing_weight_g \? String\(material\.packing_weight_g\) : ''/)
  assert.match(card, /unit_price: material\.unit_price \? String\(material\.unit_price\) : ''/)
  assert.match(card, /이번 입고의 매입처·포장중량·단가는 자유롭게 수정할 수 있습니다/)
})

test('actual inbound tool contract excludes stock reconciliation from received-material rankings', () => {
  assert.match(inventoryTools, /실제로 받은 원재료/)
  assert.match(inventoryTools, /MONI_STOCK_RECONCILIATION/)
  assert.match(inventoryTools, /실제 입고에서 반드시 제외/)
  assert.match(inventoryTools, /같은 원재료의 정상 INBOUND가 여러 건이면 기간 내 합산/)
})
