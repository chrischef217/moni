import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const productCatalog = readFileSync('src/app/api/moni/mobile-product-catalog/route.ts', 'utf8')
const productGuard = readFileSync('src/components/MoniMobileBusinessCatalogGuard.tsx', 'utf8')
const packagingRoute = readFileSync('src/app/api/moni/mobile-packaging-actions/route.ts', 'utf8')
const packagingGuard = readFileSync('src/components/MoniMobilePackagingRouteGuard.tsx', 'utf8')

test('mobile product selection is constrained to the canonical business id', () => {
  assert.match(productCatalog, /BUSINESS_ID = '20220523011'/)
  assert.match(productCatalog, /\.eq\('business_id', BUSINESS_ID\)/)
  assert.match(productGuard, /allowedProductIds/)
  assert.match(page, /MoniMobileBusinessCatalogGuard/)
})

test('legacy default compatibility is isolated to packaging data only', () => {
  assert.match(packagingRoute, /PACKAGING_BUSINESS_IDS = \[BUSINESS_ID, 'default'\]/)
  assert.match(packagingRoute, /mobile_packaging_inbound/)
  assert.match(packagingRoute, /부재료 영역에만 적용/)
  assert.match(packagingGuard, /domain === 'packaging_inbound'/)
  assert.match(page, /MoniMobilePackagingRouteGuard/)
  assert.doesNotMatch(productCatalog, /'default'/)
})
