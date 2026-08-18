import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const intents = readFileSync('src/lib/moni/mobile-business-intents.ts', 'utf8')
const rawCard = readFileSync('src/components/MoniMobileRawMaterialCardV2.tsx', 'utf8')
const rawCatalog = readFileSync('src/app/api/moni/mobile-material-catalog/route.ts', 'utf8')
const rawGuard = readFileSync('src/app/api/moni/mobile-raw-card/route.ts', 'utf8')
const businessCard = readFileSync('src/components/MoniMobileBusinessCards.tsx', 'utf8')
const businessRoute = readFileSync('src/app/api/moni/mobile-business-actions/route.ts', 'utf8')
const startRoute = readFileSync('src/app/api/moni/mobile-action-start/route.ts', 'utf8')

test('mobile page uses first-class V2 cards and no longer mounts legacy raw DOM enhancer', () => {
  assert.match(page, /MoniMobileRawMaterialCardV2/)
  assert.match(page, /MoniMobileBusinessCards/)
  assert.doesNotMatch(page, /MoniMobileCrudCatalogEnhancer/)
  assert.doesNotMatch(page, /<MoniMobileCrudCards/)
})

test('raw material card renders the complete active catalog and connected metadata first-class', () => {
  assert.doesNotMatch(rawCatalog, /\.eq\('is_stock_managed', true\)/)
  assert.match(rawCard, /활성 원재료 \{catalog\.length\}개 전체/)
  assert.match(rawCard, /원재료명 또는 코드를 입력해서 전체 목록 검색/)
  assert.match(rawCard, /현재재고/)
  assert.match(rawCard, /주 매입처/)
  assert.match(rawCard, /포장기준/)
  assert.match(rawCard, /기준단가/)
  assert.match(rawCard, /규격/)
  assert.match(rawCard, /원산지/)
  assert.match(rawCard, /재고관리 미설정/)
})

test('strict raw-card guard prevents packaging and unrelated writes from becoming raw material cards', () => {
  assert.match(rawGuard, /intent\.domain !== 'raw_material_inbound'/)
  assert.match(intents, /부재료\|포장재\|부자재/)
  assert.match(intents, /domain: 'packaging_inbound'/)
  assert.match(intents, /domain: 'raw_material_inbound'/)
})

test('mobile card classifier covers major operational write domains', () => {
  for (const domain of ['raw_material_inbound','packaging_inbound','production_plan','production_work','sales_order','purchase','payment']) {
    assert.match(intents, new RegExp(domain))
  }
})

test('non-raw business cards use prepare then explicit execute', () => {
  assert.match(businessCard, /command: 'prepare'/)
  assert.match(businessCard, /command: 'execute'/)
  assert.match(businessCard, /아직 실제 데이터는 바뀌지 않았습니다/)
  assert.match(businessCard, /최종 확정 및 실행/)
  assert.match(businessRoute, /status: 'PENDING'/)
  assert.match(businessRoute, /expires_at/)
})

test('production plan and production operations reuse audited prepare execute contracts', () => {
  assert.match(businessRoute, /prepareProductionPlanChange/)
  assert.match(businessRoute, /executeProductionPlanChange/)
  assert.match(businessRoute, /prepareProductionOperation/)
  assert.match(businessRoute, /executeProductionOperation/)
})

test('sales card preserves client override then base price semantics', () => {
  assert.match(businessRoute, /sales_client_variant_terms/)
  assert.match(businessCard, /거래처 예외단가/)
  assert.match(businessCard, /기본단가/)
  assert.match(businessCard, /salesPrice/)
})

test('packaging automatic outbound cannot be edited through mobile inbound card', () => {
  assert.match(businessRoute, /자동 출고 내역은 수정·삭제할 수 없습니다/)
  assert.match(businessRoute, /packaging_transactions/)
})

test('text-only business requests end agent turn and open structured cards immediately', () => {
  assert.match(startRoute, /structured_action_card: true/)
  assert.match(startRoute, /MONI_MOBILE_BUSINESS_CARD_V2/)
  assert.match(startRoute, /classifyMobileBusinessIntent/)
})
