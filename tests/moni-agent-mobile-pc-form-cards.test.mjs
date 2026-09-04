import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = (path) => readFileSync(path, 'utf8')
const page = read('src/app/mobile/page.tsx')
const coreIntents = read('src/lib/moni/mobile-business-intents.ts')
const extendedIntents = read('src/lib/moni/mobile-extended-intents.ts')
const startRoute = read('src/app/api/moni/mobile-action-start/route.ts')
const coreRoute = read('src/app/api/moni/mobile-business-actions/route.ts')
const extendedRoute = read('src/app/api/moni/mobile-extended-actions/route.ts')
const extendedCard = read('src/components/MoniMobileExtendedFormCard.tsx')
const recipeRoute = read('src/app/api/moni/recipes/route.ts')

test('mobile page mounts universal PC form card and uses hardened execution route directly', () => {
  assert.match(page, /MoniMobileExtendedFormCard/)
  assert.match(page, /<MoniMobileExtendedFormCard\s*\/>/)
  assert.doesNotMatch(page, /MoniMobileBusinessExecuteGuard/)
})

test('extended mobile intent registry covers PC operational form domains', () => {
  for (const domain of [
    'product_master', 'production_unit', 'recipe', 'raw_material_master', 'packaging_master',
    'sanitation', 'finished_goods_adjustment', 'receivable', 'sales_target', 'sales_client',
    'sales_pricing', 'business_person', 'business_opportunity', 'business_activity', 'business_work_log',
  ]) assert.match(extendedIntents, new RegExp(`'${domain}'`))
})

test('read questions remain on normal MONI agent instead of opening write cards', () => {
  assert.match(coreIntents, /조회 질문은 기존 MONI Agent가 처리한다/)
  assert.match(extendedIntents, /const writeCue = hasExplicitWriteCue\(value\)/)
  assert.match(extendedIntents, /if \(!value\) return null/)
  assert.match(extendedIntents, /if \(!writeCue\) return null/)
})

test('text write intent opens structured card before long agent execution', () => {
  assert.match(startRoute, /classifyMobileBusinessIntent/)
  assert.match(startRoute, /classifyMobileExtendedIntent/)
  assert.match(startRoute, /structured_action_card: true/)
  assert.match(startRoute, /MONI_MOBILE_PC_FORM_CARD_V1/)
})

test('universal form renderer supports searchable selects and prepare then explicit execute', () => {
  assert.match(extendedCard, /function SearchSelect/)
  assert.match(extendedCard, /command:'prepare'/)
  assert.match(extendedCard, /command:'execute'/)
  assert.match(extendedCard, /변경 내용 확인/)
  assert.match(extendedCard, /확정 실행/)
})

test('candidate and default database snapshots hydrate only declared PC form fields', () => {
  assert.match(extendedCard, /function pickSchemaValues/)
  assert.match(extendedCard, /allowed\.has\(key\)/)
  assert.match(extendedCard, /pickSchemaValues\(schema, next\.defaults\)/)
  assert.match(extendedCard, /pickSchemaValues\(card\.schema \|\| \[\], row\.values\)/)
  assert.doesNotMatch(extendedCard, /\.\.\.row\.values/)
})

test('extended route delegates writes to existing PC APIs instead of duplicating business rules', () => {
  for (const path of [
    '/api/moni/products', '/api/moni/raw-materials', '/api/moni/packaging-materials',
    '/api/moni/sanitation-logs', '/api/moni/finished-goods-inventory-adjustments',
    '/api/moni/receivables', '/api/moni/sales-targets', '/api/moni/sales-management',
    '/api/moni/sales-pricing-v4', '/api/moni/business-management', '/api/moni/recipes',
    '/production-units',
  ]) assert.match(extendedRoute, new RegExp(path.replaceAll('/', '\\/')))
  assert.match(extendedRoute, /verification_basis:'PC_API_SUCCESS'/)
})

test('extended execution is explicit, duplicate-safe, tenant-scoped, and audited', () => {
  assert.match(extendedRoute, /const BUSINESS_ID = '20220523011'/)
  assert.match(extendedRoute, /status:'PENDING'/)
  assert.match(extendedRoute, /status:'EXECUTING'/)
  assert.match(extendedRoute, /status:'EXECUTED'/)
  assert.match(extendedRoute, /moni_action_audit_log/)
  assert.match(extendedRoute, /if \(existing\.data\.status==='EXECUTED'\)/)
  assert.doesNotMatch(extendedRoute, /PACKAGING_BUSINESS_ID\s*=\s*'default'/)
})

test('master delete semantics preserve product raw material and packaging rows by deactivation', () => {
  assert.match(extendedRoute, /domain==='product_master'/)
  assert.match(extendedRoute, /domain==='raw_material_master'/)
  assert.match(extendedRoute, /domain==='packaging_master'/)
  assert.ok((extendedRoute.match(/is_active:false/g) || []).length >= 3)
})

test('recipe API resolves canonical food type master instead of trusting arbitrary IDs', () => {
  assert.match(recipeRoute, /async function resolveFoodTypeId/)
  assert.match(recipeRoute, /from\('food_type_master'\)/)
  assert.match(recipeRoute, /eq\('business_id', CANONICAL_MONI_BUSINESS_ID\)/)
  assert.match(recipeRoute, /type_name: foodTypeName/)
})

test('core transaction cards preserve sales item rows and cancellation semantics safely', () => {
  assert.match(coreRoute, /from\('sales_order_items'\)/)
  assert.match(coreRoute, /itemsByOrder/)
  assert.match(coreRoute, /semantic_operation/)
  assert.match(coreRoute, /if \(operation === 'CANCEL'\) return 'DELETE'/)
  assert.match(coreRoute, /status: 'EXECUTING'/)
  assert.match(coreRoute, /moni_action_audit_log/)
})

test('core business catalogs are canonical tenant scoped and legacy duplicate routes are absent', () => {
  assert.match(coreRoute, /from\('products'\).*eq\('business_id', BUSINESS_ID\)/s)
  assert.match(coreRoute, /from\('packaging_materials'\).*eq\('business_id', BUSINESS_ID\)/s)
  assert.equal(existsSync('src/app/api/moni/mobile-packaging-actions/route.ts'), false)
  assert.equal(existsSync('src/app/api/moni/mobile-business-execute/route.ts'), false)
  assert.equal(existsSync('src/components/MoniMobilePackagingRouteGuard.tsx'), false)
  assert.equal(existsSync('src/components/MoniMobileBusinessExecuteGuard.tsx'), false)
})
