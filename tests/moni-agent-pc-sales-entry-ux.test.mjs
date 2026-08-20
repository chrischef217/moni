import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const enhancer = readFileSync('src/components/SalesStatementsUnifiedEnhancer.tsx', 'utf8')
const salesForm = readFileSync('src/components/SalesOrderV4Module.tsx', 'utf8')
const salesApi = readFileSync('src/app/api/moni/sales-orders-v4/route.ts', 'utf8')

test('PC product sales replaces long variant select with type-to-search UX', () => {
  assert.match(salesForm, /판매규격 선택/)
  assert.match(enhancer, /제품명·규격 검색 \(예: 애플\)/)
  assert.match(enhancer, /data-moni-variant-search/)
  assert.match(enhancer, /tokens\.every\(token=>haystack\.includes\(token\)\)/)
  assert.match(enhancer, /setNativeSelectValue\(select,option\.value\)/)
  assert.match(enhancer, /dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/)
})

test('PC product sales blocks invalid quantities before save and shows the reason inside the modal', () => {
  assert.match(enhancer, /q<=0/)
  assert.match(enhancer, /수량은 0보다 커야 합니다/)
  assert.match(enhancer, /showModalError\(modal,validation\.message\)/)
  assert.match(enhancer, /event\.stopImmediatePropagation\(\)/)
  assert.match(enhancer, /data-moni-sales-form-error/)
  assert.match(salesApi, /if \(quantity <= 0\) throw new Error/)
})

test('server-side sales save failures are mirrored into the open product-sale modal', () => {
  assert.match(enhancer, /function mirrorServerError/)
  assert.match(enhancer, /border-red-500/)
  assert.match(enhancer, /showModalError\(modal,exactText\(globalError\)\)/)
})

test('PC product sales validates variant, quantity, price, and MOQ before sending save', () => {
  assert.match(enhancer, /제품·판매규격을 검색해 선택해 주세요/)
  assert.match(enhancer, /단가는 0보다 커야 합니다/)
  assert.match(enhancer, /최소주문수량/)
  assert.match(enhancer, /validateProductModal\(modal\)/)
})
