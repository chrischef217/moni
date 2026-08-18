import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const pricing = fs.readFileSync('src/components/SalesVariantPricingModule.tsx', 'utf8')
const shell = fs.readFileSync('src/components/BusinessManagementIntegratedShell.tsx', 'utf8')
const menu = fs.readFileSync('src/components/SalesManagementMenuController.tsx', 'utf8')
const orders = fs.readFileSync('src/app/api/moni/sales-orders-v4/route.ts', 'utf8')

test('product spec pricing is the single sales pricing surface', () => {
  assert.match(menu, /제품 규격 단가/)
  assert.match(pricing, /제품별 판매규격 및 단가/)
  assert.match(pricing, /판매규격 및 단가 수정/)
  assert.match(pricing, /판매규격 및 단가 추가/)
  assert.doesNotMatch(shell, /SalesClientPriceOverrideModule/)
  assert.match(shell, /<SalesVariantPricingModule key="sales-pricing-v4" \/>/)
})

test('packaging material is searchable from registered active secondary materials', () => {
  assert.match(pricing, /부재료명·코드·규격을 입력해 검색/)
  assert.match(pricing, /packagingMaterials\.filter\(\(row\) => row\.is_active !== false\)/)
  assert.match(pricing, /row\.material_code/)
  assert.match(pricing, /row\.spec/)
  assert.match(pricing, /choosePackaging\(row\)/)
})

test('client exceptions are managed inside each product variant modal', () => {
  assert.match(pricing, /거래처별 예외 규격·단가/)
  assert.match(pricing, /\+ 거래처 예외 추가/)
  assert.match(pricing, /save_client_variant_term/)
  assert.match(pricing, /variant_id: savedVariantId/)
  assert.match(pricing, /등록하지 않은 거래처는 위 기본단가와 기본 MOQ를 자동 사용/)
})

test('sales order resolver keeps client override first and base price fallback', () => {
  assert.match(orders, /const term = termByVariant\.get\(variantId\)/)
  assert.match(orders, /const moq = term \? num\(term\.moq_quantity\) : num\(variant\.moq_quantity\)/)
  assert.match(orders, /const defaultPrice = term \? money\(term\.unit_price\) : money\(variant\.default_unit_price\)/)
})
