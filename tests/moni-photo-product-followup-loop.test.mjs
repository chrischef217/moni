import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const productionTools = readFileSync('src/lib/moni/agent/tools/production.ts', 'utf8')
const migration = readFileSync('supabase/migrations/202608160002_bound_photo_product_master_lookup.sql', 'utf8')

test('photo product presence checks stop after one exact product-master lookup', () => {
  assert.match(productionTools, /사진에서 읽은 정확한 제품명 또는 라벨명을 한 번만 검색한다/)
  assert.match(productionTools, /결과가 0건이면 그 정확한 이름의 제품은 공식 제품 마스터에 등록되지 않은 것으로 답하고 종료한다/)
  assert.match(productionTools, /동의어·번역어·카테고리 키워드로 반복 검색하지 않는다/)
})

test('the approved shared factuality rule persists the same bounded lookup contract', () => {
  assert.match(migration, /사진에서 제품명을 식별한 뒤 사용자가 그 제품이 우리 제품인지 확인해 달라고 하면/)
  assert.match(migration, /정확히 한 번 조회한다/)
  assert.match(migration, /동의어·카테고리 검색을 연속 반복하지 않는다/)
  assert.match(migration, /business_id = '20220523011'/)
  assert.match(migration, /context_key = 'FACTUALITY'/)
})
