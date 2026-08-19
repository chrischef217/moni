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
const rawTx = readFileSync('src/app/api/moni/raw-material-transactions/route.ts', 'utf8')

test('bare material inventory edits never open historical inbound or material-master write cards', () => {
  for (const input of [
    '원재료 재고 수정해줘',
    '원재료 재고 삭제해줘',
    '부재료 재고 수정해줘',
    '부재료 재고 삭제해줘',
    '포장재 재고 변경해줘',
  ]) {
    assert.equal(business.classifyMobileBusinessIntent(input), null, `transaction card: ${input}`)
    assert.equal(extended.classifyMobileExtendedIntent(input), null, `master card: ${input}`)
  }
})

test('explicit inbound ledger edits still open the intended transaction cards', () => {
  assert.deepEqual(business.classifyMobileBusinessIntent('원재료 입고 수정해줘'), { domain: 'raw_material_inbound', operation: 'UPDATE' })
  assert.deepEqual(business.classifyMobileBusinessIntent('원재료 수불 삭제해줘'), { domain: 'raw_material_inbound', operation: 'DELETE' })
  assert.deepEqual(business.classifyMobileBusinessIntent('부재료 입고 수정해줘'), { domain: 'packaging_inbound', operation: 'UPDATE' })
  assert.deepEqual(business.classifyMobileBusinessIntent('부재료 수불 삭제해줘'), { domain: 'packaging_inbound', operation: 'DELETE' })
})

test('material master edits still require master-information language, not inventory language', () => {
  assert.deepEqual(extended.classifyMobileExtendedIntent('원재료 정보 수정해줘'), { domain: 'raw_material_master', operation: 'UPDATE' })
  assert.deepEqual(extended.classifyMobileExtendedIntent('부재료 정보 수정해줘'), { domain: 'packaging_master', operation: 'UPDATE' })
})

test('raw-material PATCH really mutates an existing inbound row and recalculates current stock, so stock wording must stay blocked', () => {
  assert.match(rawTx, /export async function PATCH/)
  assert.match(rawTx, /from\('raw_material_transactions'\)\.select\('\*'\)\.eq\('id', id\)/)
  assert.match(rawTx, /const nextStockG = currentStockG - oldQuantityG \+ nextQuantityG/)
  assert.match(rawTx, /from\('raw_material_transactions'\)[\s\S]*?\.update\(/)
})
