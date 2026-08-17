import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync('src/app/mobile/page.tsx', 'utf8')
const card = readFileSync('src/components/MoniMobileCrudCards.tsx', 'utf8')
const route = readFileSync('src/app/api/moni/mobile-actions/route.ts', 'utf8')
const migration = readFileSync('supabase/migrations/202608170001_mobile_raw_material_chat_actions.sql', 'utf8')

test('mobile chat mounts an in-chat structured CRUD card surface', () => {
  assert.match(page, /MoniMobileCrudCards/)
  assert.match(page, /<MoniMobileCrudCards\s*\/>/)
  assert.match(card, /MONI 업무 카드/)
  assert.match(card, /원재료 입고 입력/)
  assert.match(card, /원재료 입고 수정/)
  assert.match(card, /원재료 입고 삭제/)
  assert.match(card, /입력 내용 확인/)
  assert.match(card, /변경 내용 확인/)
  assert.match(card, /삭제 내용 확인/)
  assert.match(card, /입고 확정/)
  assert.match(card, /수정 확정/)
  assert.match(card, /삭제 확정/)
})

test('the card supports one-pass fields, supplier suggestion, and selectable delete/update rows', () => {
  assert.match(card, /raw_material_id/)
  assert.match(card, /tx_date/)
  assert.match(card, /quantity_packs/)
  assert.match(card, /packing_weight_g/)
  assert.match(card, /quantity_g/)
  assert.match(card, /supplier/)
  assert.match(card, /unit_price/)
  assert.match(card, /note/)
  assert.match(card, /moni-supplier-suggestions/)
  assert.match(card, /selectedTransactionId/)
  assert.match(card, /candidate\.protected/)
  assert.match(card, /여기서는 삭제\/수정 불가/)
})

test('photo analysis arriving after the blank card only backfills still-empty fields', () => {
  assert.match(card, /lastAssistantMessageId/)
  assert.match(card, /assistantId && assistantId !== lastAssistantMessageId\.current/)
  assert.match(card, /const inferred = initialFields\(next\)/)
  assert.match(card, /if \(!text\(merged\[key\]\) && text\(value\)\) merged\[key\] = value/)
})

test('explicit inbound or purchase-entry commands open a draft even before exact photo material matching', () => {
  assert.match(route, /const create = \/\(\?:입고\|매입\)/)
  assert.match(route, /if \(rawContext && remove\) return 'DELETE'/)
  assert.match(route, /if \(rawContext && update\) return 'UPDATE'/)
  assert.match(route, /if \(create\) return 'CREATE'/)
  assert.doesNotMatch(route, /if \(\(rawContext \|\| hasMaterialMatch\) && create\)/)
})

test('mobile action API is admin-only, canonical-business scoped, and supplier-history aware', () => {
  assert.match(route, /getSessionFromRequest/)
  assert.match(route, /session\.role !== 'admin'/)
  assert.match(route, /20220523011/)
  assert.match(route, /supplierSuggestions/)
  assert.match(route, /최근 실제 입고 이력/)
  assert.match(route, /\.eq\('business_id', BUSINESS_ID\)/)
  assert.match(route, /\.eq\('item_code', material\.id\)/)
  assert.match(route, /\.eq\('txn_type', 'INBOUND'\)/)
})

test('prepare only creates a PENDING confirmation and never mutates raw-material business rows', () => {
  assert.match(route, /action_domain: ACTION_DOMAIN/)
  assert.match(route, /action_type: operation/)
  assert.match(route, /status: 'PENDING'/)
  assert.match(route, /expiresAt = new Date\(Date\.now\(\) \+ 15 \* 60 \* 1000\)/)
  assert.doesNotMatch(route, /from\('raw_material_transactions'\)\.insert/)
  assert.doesNotMatch(route, /from\('raw_materials'\)\.update/)
  assert.match(route, /생산 또는 매입 원장과 연결된 기록은 원본 업무에서 수정·취소해야 합니다/)
})

test('execute is ownership-gated and delegates the actual mutation to the atomic RPC', () => {
  assert.match(route, /confirmation\.requested_by_login_id !== auth\.session\.loginId/)
  assert.match(route, /confirmation\.source_client_id !== sourceClientId/)
  assert.match(route, /confirmation\.status !== 'PENDING'/)
  assert.match(route, /moni_execute_raw_material_transaction_action/)
  assert.match(route, /모바일 업무 카드에서 확정 실행/)
})

test('database executor locks rows, protects linked ledgers, and keeps stock and transaction changes atomic', () => {
  assert.match(migration, /security definer/i)
  assert.match(migration, /where id = p_confirmation_id\s+for update/i)
  assert.match(migration, /c\.action_domain <> 'raw_material_transaction'/)
  assert.match(migration, /c\.status <> 'PENDING'/)
  assert.match(migration, /tx\.production_record_id is not null or tx\.source_purchase_id is not null/)
  assert.match(migration, /v_next_stock_g < 0/)
  assert.match(migration, /insert into public\.raw_material_transactions/)
  assert.match(migration, /update public\.raw_materials/)
  assert.match(migration, /delete from public\.raw_material_transactions/)
  assert.match(migration, /grant execute on function public\.moni_execute_raw_material_transaction_action.*service_role/is)
})
