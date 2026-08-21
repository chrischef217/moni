import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const intents = readFileSync('src/lib/moni/mobile-business-intents.ts', 'utf8')
const start = readFileSync('src/app/api/moni/mobile-action-start/route.ts', 'utf8')
const route = readFileSync('src/app/api/moni/mobile-sales-export-bundle/route.ts', 'utf8')
const extractor = readFileSync('src/lib/moni/mobile-sales-export-context.ts', 'utf8')
const card = readFileSync('src/components/MoniMobileSalesExportBundleCard.tsx', 'utf8')
const mobilePage = readFileSync('src/app/mobile/page.tsx', 'utf8')

function at(source, token) {
  const index = source.indexOf(token)
  assert.notEqual(index, -1, `missing token: ${token}`)
  return index
}

test('combined transaction statement + invoice/packing list is routed to export bundle before statement-only routing', () => {
  assert.match(intents, /\| 'sales_export_bundle'/)
  const bundle = at(intents, "return { domain: 'sales_export_bundle', operation: 'CREATE' }")
  const statement = at(intents, "return { domain: 'sales_statement', operation: 'CREATE' }")
  assert.ok(bundle < statement, 'bundle routing must be evaluated before statement-only routing')
  assert.match(intents, /commercial\\s\*invoice\|invoice\|인보이스/)
  assert.match(intents, /packing\\s\*list\|packinglist\|패킹\\s\*리스트\|패킹리스트/)
})

test('mobile action start continues to use the shared business classifier so bundle requests bypass long agent runtime', () => {
  assert.match(start, /classifyMobileBusinessIntent\(rawMessage\)/)
  assert.match(start, /structured_action_card: true/)
})

test('bundle route reads recent conversation context instead of only the final command', () => {
  assert.match(route, /\.limit\(24\)/)
  assert.match(route, /extractMobileSalesExportContext/)
  assert.match(route, /history: history\.map/)
  assert.match(extractor, /recent.*대화/i)
  assert.match(extractor, /제품 ID, 거래처 ID, 수출품목 설정 ID를 만들거나 추측하지 마세요/)
  assert.match(extractor, /사용자가 정정한 내용이 있으면 사용자 최신 내용을 우선/)
})

test('canonical matching never auto-selects fuzzy product suggestions', () => {
  assert.match(route, /function exactExportProduct/)
  assert.match(route, /if \(!names\.includes\(needle\)\) return false/)
  assert.match(route, /return matches\.length === 1 \? matches\[0\] : null/)
  assert.match(route, /function productSuggestions/)
  const exact = at(route, 'function exactExportProduct')
  const suggestions = at(route, 'function productSuggestions')
  assert.ok(exact < suggestions)
  assert.match(route, /missing\.push\(`\$\{index \+ 1\}번째 품목 “\$\{row\.name\}”의 공식 수출품목 매칭`\)/)
})

test('kg or ea quantities are converted to cartons only when canonical packing data yields an exact integer', () => {
  assert.match(route, /if \(unit === 'EA'\)/)
  assert.match(route, /if \(unit === 'KG'\)/)
  assert.match(route, /Math\.abs\(ratio - Math\.round\(ratio\)\) < 0\.000001/)
  assert.match(route, /CTN 수량 또는 포장단위 확인/)
})

test('prepare requires canonical destination, export product settings, positive cartons, and single currency', () => {
  assert.match(route, /수출처\(Consignee\)를 선택해 주세요/)
  assert.match(route, /공식 수출품목을 선택해 주세요/)
  assert.match(route, /CTN 수량을 1 이상 입력해 주세요/)
  assert.match(route, /모든 수출품목 통화를 하나로 통일해 주세요/)
  assert.match(route, /status: 'GENERATED'/)
})

test('execute creates one export document, syncs that same document into sales, and rolls back partial failure', () => {
  const create = at(route, "internalJson(request, '/api/moni/export-documents'")
  const sync = at(route, "internalJson(request, '/api/moni/export-sales-sync', { method: 'POST', body: JSON.stringify({ id: documentId, action: 'SYNC' }) })")
  assert.ok(create < sync, 'export document must be the source before sales sync')
  assert.match(route, /rollbackBundle\(request, documentId\)/)
  assert.match(route, /action: 'DELETE'/)
  assert.match(route, /method: 'DELETE'/)
  assert.match(route, /EXPORT_DOCUMENT_CREATE_AND_SALES_SYNC_SUCCESS/)
})

test('completed bundle returns all final document links', () => {
  assert.match(route, /statement_url:/)
  assert.match(route, /invoice_url:/)
  assert.match(route, /packing_list_url:/)
  assert.match(route, /export_bundle_url:/)
  assert.match(card, /거래명세표 보기/)
  assert.match(card, /Commercial Invoice 보기/)
  assert.match(card, /Packing List 보기/)
  assert.match(card, /Invoice \+ Packing List 함께 보기/)
})

test('mobile bundle card is mounted and explicitly avoids blank-form re-entry', () => {
  assert.match(mobilePage, /MoniMobileSalesExportBundleCard/)
  assert.match(card, /이미 말한 값은 다시 입력할 필요가 없습니다/)
  assert.match(card, /대화에서 추출:/)
  assert.match(card, /부족한 값 .*개 확인 필요/)
  assert.match(card, /자동 입력 내용 확인/)
  assert.doesNotMatch(card, /items:\s*\[\{\s*sales_variant_id:\s*''/)
})
