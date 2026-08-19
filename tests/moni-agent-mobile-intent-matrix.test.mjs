import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

async function loadTsModule(path) {
  const source = readFileSync(path, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`)
}

const business = await loadTsModule('src/lib/moni/mobile-business-intents.ts')
const extended = await loadTsModule('src/lib/moni/mobile-extended-intents.ts')
const businessCardSource = readFileSync('src/components/MoniMobileBusinessCards.tsx', 'utf8')
const packagingApiSource = readFileSync('src/app/api/moni/packaging-materials/route.ts', 'utf8')

const businessCases = [
  ['원재료 입고 입력해줘', { domain: 'raw_material_inbound', operation: 'CREATE' }],
  ['원재료 입고 수정해줘', { domain: 'raw_material_inbound', operation: 'UPDATE' }],
  ['부재료 입고 삭제해줘', { domain: 'packaging_inbound', operation: 'DELETE' }],
  ['생산계획 등록해줘', { domain: 'production_plan', operation: 'CREATE' }],
  ['생산 작업지시 수정해줘', { domain: 'production_work', operation: 'UPDATE' }],
  ['생산완료 처리해줘', { domain: 'production_work', operation: 'COMPLETE' }],
  ['생산확정 처리해줘', { domain: 'production_work', operation: 'CONFIRM' }],
  ['거래명세표 만들어줘', { domain: 'sales_order', operation: 'CREATE' }],
  ['판매 취소해줘', { domain: 'sales_order', operation: 'CANCEL' }],
  ['매입 등록해줘', { domain: 'purchase', operation: 'CREATE' }],
  ['매입대금 지급해줘', { domain: 'payment', operation: 'CREATE' }],
]

const extendedCases = [
  ['제품 등록해줘', { domain: 'product_master', operation: 'CREATE' }],
  ['제품 정보 수정해줘', { domain: 'product_master', operation: 'UPDATE' }],
  ['생산단위 등록해줘', { domain: 'production_unit', operation: 'CREATE' }],
  ['레시피 수정해줘', { domain: 'recipe', operation: 'UPDATE' }],
  ['원재료 정보 수정해줘', { domain: 'raw_material_master', operation: 'UPDATE' }],
  ['부재료 정보 등록해줘', { domain: 'packaging_master', operation: 'CREATE' }],
  ['위생점검 입력해줘', { domain: 'sanitation', operation: 'CREATE' }],
  ['완제품 재고 조정해줘', { domain: 'finished_goods_adjustment', operation: 'ADJUST' }],
  ['수금 입력해줘', { domain: 'receivable', operation: 'RECEIVE' }],
  ['입금 취소해줘', { domain: 'receivable', operation: 'REVERSE' }],
  ['입금예정일 변경해줘', { domain: 'receivable', operation: 'SET_DUE' }],
  ['수금조건 설정해줘', { domain: 'receivable', operation: 'SET_RULE' }],
  ['영업 목표 매출 설정해줘', { domain: 'sales_target', operation: 'SET_TARGET' }],
  ['영업 목표 매출 삭제해줘', { domain: 'sales_target', operation: 'CLEAR_TARGET' }],
  ['거래처 등록해줘', { domain: 'sales_client', operation: 'CREATE' }],
  ['판매단가 수정해줘', { domain: 'sales_pricing', operation: 'UPDATE' }],
  ['직원 등록해줘', { domain: 'business_person', operation: 'CREATE' }],
  ['영업기회 등록해줘', { domain: 'business_opportunity', operation: 'CREATE' }],
  ['영업활동 기록해줘', { domain: 'business_activity', operation: 'CREATE' }],
  ['프리랜서 작업시간 입력해줘', { domain: 'business_work_log', operation: 'CREATE' }],
  ['생산 프리랜서 근무시간 수정해줘', { domain: 'business_work_log', operation: 'UPDATE' }],
]

test('business transaction commands route to the intended mobile card', () => {
  for (const [input, expected] of businessCases) {
    assert.deepEqual(business.classifyMobileBusinessIntent(input), expected, input)
  }
})

test('extended PC-form commands route to the intended mobile card', () => {
  for (const [input, expected] of extendedCases) {
    assert.deepEqual(extended.classifyMobileExtendedIntent(input), expected, input)
  }
})

test('read-only questions do not accidentally open write cards', () => {
  const reads = ['거래처 목록 보여줘', '제품 정보 알려줘', '원재료 재고 알려줘', '위생점검 보여줘', '매출 얼마나 돼?', '지급 내역 보여줘']
  for (const input of reads) {
    assert.equal(business.classifyMobileBusinessIntent(input), null, `business: ${input}`)
    assert.equal(extended.classifyMobileExtendedIntent(input), null, `extended: ${input}`)
  }
})

test('business card prepare button and guidance use operation-specific wording', () => {
  assert.match(businessCardSource, /function prepareButtonLabel\(operation: Operation\)/)
  for (const label of ['입력 내용 확인', '변경 내용 확인', '삭제 내용 확인', '취소 내용 확인', '완료 내용 확인', '확정 내용 확인']) {
    assert.match(businessCardSource, new RegExp(label))
  }
  assert.match(business.mobileBusinessCardText({ domain: 'sales_order', operation: 'UPDATE' }), /변경 내용 확인/)
  assert.match(business.mobileBusinessCardText({ domain: 'sales_order', operation: 'CANCEL' }), /취소 내용 확인/)
})

test('packaging master list is tenant-scoped to the canonical MONI business', () => {
  assert.match(packagingApiSource, /from\('packaging_materials'\)[\s\S]*?\.eq\('business_id', CANONICAL_MONI_BUSINESS_ID\)[\s\S]*?\.order\('material_name'/)
})
