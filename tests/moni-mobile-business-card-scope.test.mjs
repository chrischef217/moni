import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const productCatalog = readFileSync('src/app/api/moni/mobile-product-catalog/route.ts', 'utf8')
const businessRoute = readFileSync('src/app/api/moni/mobile-business-actions/route.ts', 'utf8')
const extendedRoute = readFileSync('src/app/api/moni/mobile-extended-actions/route.ts', 'utf8')

test('mobile product and packaging selection are constrained to canonical business id', () => {
  assert.match(productCatalog, /BUSINESS_ID = '20220523011'/)
  assert.match(productCatalog, /\.eq\('business_id', BUSINESS_ID\)/)
  assert.match(businessRoute, /from\('products'\).*eq\('business_id', BUSINESS_ID\)/s)
  assert.match(businessRoute, /from\('packaging_materials'\).*eq\('business_id', BUSINESS_ID\)/s)
  assert.match(extendedRoute, /const BUSINESS_ID = '20220523011'/)
})

test('legacy default compatibility routes are removed from the mobile runtime', () => {
  assert.doesNotMatch(page, /MoniMobileBusinessCatalogGuard/)
  assert.doesNotMatch(page, /MoniMobilePackagingRouteGuard/)
  assert.equal(existsSync('src/components/MoniMobileBusinessCatalogGuard.tsx'), false)
  assert.equal(existsSync('src/components/MoniMobilePackagingRouteGuard.tsx'), false)
  assert.equal(existsSync('src/app/api/moni/mobile-packaging-actions/route.ts'), false)
  assert.doesNotMatch(businessRoute, /PACKAGING_BUSINESS_IDS/)
  assert.doesNotMatch(extendedRoute, /PACKAGING_BUSINESS_ID\s*=\s*'default'/)
  assert.doesNotMatch(productCatalog, /'default'/)
})
