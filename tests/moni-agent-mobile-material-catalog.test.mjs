import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const catalogRoute = readFileSync('src/app/api/moni/mobile-material-catalog/route.ts', 'utf8')
const enhancer = readFileSync('src/components/MoniMobileCrudCatalogEnhancer.tsx', 'utf8')
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

test('mobile card exposes a full searchable material list and keeps unmanaged rows visible as status', () => {
  assert.match(page, /MoniMobileCrudCatalogEnhancer/)
  assert.match(enhancer, /원재료명 또는 코드 입력 · 전체 목록 검색/)
  assert.match(enhancer, /normalize\(material\.name\)\.includes\(needle\)/)
  assert.match(enhancer, /normalize\(material\.item_code\)\.includes\(needle\)/)
  assert.match(enhancer, /재고관리 미설정/)
  assert.match(enhancer, /활성 원재료 .*전체 · 입고 가능/)
})

test('selected material prefills linked supplier, pack weight and operational package price while inputs remain editable', () => {
  assert.match(catalogRoute, /default_supplier/)
  assert.match(catalogRoute, /packing_weight_source/)
  assert.match(catalogRoute, /unit_price_source/)
  assert.match(enhancer, /setNativeValue\(supplierInput, material\.default_supplier \|\| ''\)/)
  assert.match(enhancer, /setNativeValue\(packingInput, material\.packing_weight_g \? String\(material\.packing_weight_g\) : ''\)/)
  assert.match(enhancer, /setNativeValue\(unitPriceInput, material\.unit_price \? String\(material\.unit_price\) : ''\)/)
  assert.match(enhancer, /이번 입고 건에서 자유롭게 수정할 수 있습니다/)
})

test('actual inbound tool contract excludes stock reconciliation from received-material rankings', () => {
  assert.match(inventoryTools, /실제로 받은 원재료/)
  assert.match(inventoryTools, /MONI_STOCK_RECONCILIATION/)
  assert.match(inventoryTools, /실제 입고에서 반드시 제외/)
  assert.match(inventoryTools, /같은 원재료의 정상 INBOUND가 여러 건이면 기간 내 합산/)
})
