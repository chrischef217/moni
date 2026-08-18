import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const moduleSource = readFileSync('src/components/SalesClientPriceOverrideModule.tsx', 'utf8')
const shell = readFileSync('src/components/BusinessManagementIntegratedShell.tsx', 'utf8')
const orderRoute = readFileSync('src/app/api/moni/sales-orders-v4/route.ts', 'utf8')

test('PC pricing view separates client price overrides from sales variant management', () => {
  assert.match(shell, /SalesClientPriceOverrideModule/)
  assert.match(moduleSource, /거래처별 예외단가/)
  assert.match(moduleSource, /section\[data-moni-legacy-client-pricing='true'\]/)
})

test('client pricing starts with no selected client and clearly means all clients use base price', () => {
  assert.match(moduleSource, /useState\(''\)/)
  assert.match(moduleSource, /선택 안 함 · 모든 거래처 기본단가 적용/)
  assert.match(moduleSource, /전체 기본단가 적용 상태입니다/)
  assert.doesNotMatch(moduleSource, /find\(\(row\) => row\.status === 'active'\)\?\.id/)
})

test('client override UI only saves client variant terms and never creates a sales variant', () => {
  assert.match(moduleSource, /action: 'save_client_variant_term'/)
  assert.match(moduleSource, /이 거래처만 적용/)
  assert.doesNotMatch(moduleSource, /action: 'save_variant'/)
})

test('selected client without an active override visibly inherits the base price', () => {
  assert.match(moduleSource, /overrideActive \? Number\(term\?\.unit_price \|\| 0\) : Number\(variant\.default_unit_price \|\| 0\)/)
  assert.match(moduleSource, /기본단가 자동 적용/)
  assert.match(moduleSource, /예외단가/)
})

test('sales order server uses only active client terms and falls back to variant base price', () => {
  assert.match(orderRoute, /sales_client_variant_terms'\)\.select\('\*'\)\.eq\('business_id', BUSINESS_ID\)\.eq\('active', true\)/)
  assert.match(orderRoute, /const defaultPrice = term \? money\(term\.unit_price\) : money\(variant\.default_unit_price\)/)
})
